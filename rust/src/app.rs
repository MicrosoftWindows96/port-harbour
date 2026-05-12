//! Application state.

use std::collections::{HashMap, VecDeque};
use std::time::Instant;

use ratatui::widgets::TableState;

use crate::scan::{Conn, Scanner};

pub const HISTORY_LEN: usize = 240;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SortKey {
    Port,
    Proto,
    State,
    Pid,
    Process,
    User,
}

impl SortKey {
    pub const ALL: [SortKey; 6] = [
        SortKey::Port,
        SortKey::Proto,
        SortKey::State,
        SortKey::Pid,
        SortKey::Process,
        SortKey::User,
    ];
    pub fn label(&self) -> &'static str {
        match self {
            SortKey::Port => "port",
            SortKey::Proto => "proto",
            SortKey::State => "state",
            SortKey::Pid => "pid",
            SortKey::Process => "process",
            SortKey::User => "user",
        }
    }
    pub fn next(self) -> SortKey {
        let i = Self::ALL.iter().position(|s| *s == self).unwrap_or(0);
        Self::ALL[(i + 1) % Self::ALL.len()]
    }
}

#[derive(Clone, Debug)]
pub struct ProcAgg {
    pub name: String,
    pub count: usize,
}

pub struct App {
    pub scanner: Scanner,
    pub conns: Vec<Conn>,
    pub filtered: Vec<usize>,

    pub paused: bool,
    pub listening_only: bool,
    pub show_stats: bool,
    pub show_banner: bool,
    pub show_help: bool,
    pub filter_mode: bool,
    pub filter: String,
    pub sort_key: SortKey,
    pub sort_reverse: bool,

    pub interval_ms: u64,
    pub last_scan: Instant,
    pub last_scan_ms: u128,

    pub table_state: TableState,

    pub hist_total: VecDeque<u64>,
    pub hist_tcp: VecDeque<u64>,
    pub hist_udp: VecDeque<u64>,
    pub hist_estab: VecDeque<u64>,
    pub peak_total: u64,

    pub top_procs: Vec<ProcAgg>,
    pub tcp_count: usize,
    pub udp_count: usize,
    pub listen_count: usize,
    pub estab_count: usize,
    pub ipv6_count: usize,

    pub confirm_kill: Option<KillTarget>,
    pub toast: Option<(String, Instant)>,
    pub should_quit: bool,
    pub tick: u64,
}

#[derive(Clone, Debug)]
pub struct KillTarget {
    pub pid: u32,
    pub name: String,
    pub port: u16,
}

impl App {
    pub fn new() -> Self {
        let mut table_state = TableState::default();
        table_state.select(Some(0));
        Self {
            scanner: Scanner::new(),
            conns: Vec::new(),
            filtered: Vec::new(),
            paused: false,
            listening_only: true,
            show_stats: true,
            show_banner: true,
            show_help: false,
            filter_mode: false,
            filter: String::new(),
            sort_key: SortKey::Port,
            sort_reverse: false,
            interval_ms: 1000,
            last_scan: Instant::now(),
            last_scan_ms: 0,
            table_state,
            hist_total: VecDeque::with_capacity(HISTORY_LEN),
            hist_tcp: VecDeque::with_capacity(HISTORY_LEN),
            hist_udp: VecDeque::with_capacity(HISTORY_LEN),
            hist_estab: VecDeque::with_capacity(HISTORY_LEN),
            peak_total: 0,
            top_procs: Vec::new(),
            tcp_count: 0,
            udp_count: 0,
            listen_count: 0,
            estab_count: 0,
            ipv6_count: 0,
            confirm_kill: None,
            toast: None,
            should_quit: false,
            tick: 0,
        }
    }

    pub fn tick(&mut self) {
        if self.paused {
            return;
        }
        let start = Instant::now();
        match self.scanner.scan(self.listening_only) {
            Ok(conns) => {
                self.conns = conns;
                self.last_scan_ms = start.elapsed().as_millis();
                self.last_scan = Instant::now();
                self.recompute_aggregates();
                self.apply_filter_and_sort();
            }
            Err(e) => {
                self.set_toast(format!("scan error: {e}"));
            }
        }
        self.tick += 1;
    }

    fn recompute_aggregates(&mut self) {
        self.tcp_count = self.conns.iter().filter(|c| c.proto == "TCP").count();
        self.udp_count = self.conns.iter().filter(|c| c.proto == "UDP").count();
        self.listen_count = self.conns.iter().filter(|c| c.state == "LISTEN").count();
        self.estab_count = self
            .conns
            .iter()
            .filter(|c| c.state == "ESTABLISHED")
            .count();
        self.ipv6_count = self.conns.iter().filter(|c| c.ipv6).count();

        let total = self.conns.len() as u64;
        push_bounded(&mut self.hist_total, total);
        push_bounded(&mut self.hist_tcp, self.tcp_count as u64);
        push_bounded(&mut self.hist_udp, self.udp_count as u64);
        push_bounded(&mut self.hist_estab, self.estab_count as u64);
        if total > self.peak_total {
            self.peak_total = total;
        }

        let mut bag: HashMap<String, usize> = HashMap::new();
        for c in &self.conns {
            *bag.entry(c.process.clone()).or_default() += 1;
        }
        let mut top: Vec<ProcAgg> = bag
            .into_iter()
            .map(|(name, count)| ProcAgg { name, count })
            .collect();
        top.sort_by(|a, b| b.count.cmp(&a.count).then(a.name.cmp(&b.name)));
        top.truncate(5);
        self.top_procs = top;
    }

    pub fn apply_filter_and_sort(&mut self) {
        let f = self.filter.trim().to_lowercase();
        let mut idx: Vec<usize> = if f.is_empty() {
            (0..self.conns.len()).collect()
        } else {
            self.conns
                .iter()
                .enumerate()
                .filter(|(_, c)| match_filter(c, &f))
                .map(|(i, _)| i)
                .collect()
        };

        idx.sort_by(|&a, &b| {
            let ca = &self.conns[a];
            let cb = &self.conns[b];
            let ord = match self.sort_key {
                SortKey::Port => ca.port.cmp(&cb.port),
                SortKey::Proto => ca.proto.cmp(cb.proto),
                SortKey::State => ca.state.cmp(&cb.state),
                SortKey::Pid => ca.pid.unwrap_or(0).cmp(&cb.pid.unwrap_or(0)),
                SortKey::Process => ca.process.to_lowercase().cmp(&cb.process.to_lowercase()),
                SortKey::User => ca.user.cmp(&cb.user),
            };
            if self.sort_reverse {
                ord.reverse()
            } else {
                ord
            }
        });

        self.filtered = idx;
        if self.filtered.is_empty() {
            self.table_state.select(None);
        } else {
            let s = self.table_state.selected().unwrap_or(0);
            self.table_state
                .select(Some(s.min(self.filtered.len() - 1)));
        }
    }

    pub fn selected_conn(&self) -> Option<&Conn> {
        let i = self.table_state.selected()?;
        let real = self.filtered.get(i)?;
        self.conns.get(*real)
    }

    pub fn cursor_down(&mut self) {
        if self.filtered.is_empty() {
            return;
        }
        let i = self
            .table_state
            .selected()
            .map(|i| (i + 1).min(self.filtered.len() - 1))
            .unwrap_or(0);
        self.table_state.select(Some(i));
    }

    pub fn cursor_up(&mut self) {
        if self.filtered.is_empty() {
            return;
        }
        let i = self
            .table_state
            .selected()
            .map(|i| i.saturating_sub(1))
            .unwrap_or(0);
        self.table_state.select(Some(i));
    }

    pub fn cursor_page(&mut self, delta: isize, page: usize) {
        if self.filtered.is_empty() {
            return;
        }
        let len = self.filtered.len();
        let cur = self.table_state.selected().unwrap_or(0) as isize;
        let next = (cur + delta * page as isize).clamp(0, len as isize - 1) as usize;
        self.table_state.select(Some(next));
    }

    pub fn cursor_home(&mut self) {
        if !self.filtered.is_empty() {
            self.table_state.select(Some(0));
        }
    }
    pub fn cursor_end(&mut self) {
        if !self.filtered.is_empty() {
            self.table_state.select(Some(self.filtered.len() - 1));
        }
    }

    pub fn set_toast(&mut self, s: String) {
        self.toast = Some((s, Instant::now()));
    }

    pub fn toast_active(&self) -> Option<&str> {
        match &self.toast {
            Some((s, t)) if t.elapsed().as_secs() < 4 => Some(s.as_str()),
            _ => None,
        }
    }

    pub fn faster(&mut self) {
        self.interval_ms = self.interval_ms.saturating_sub(250).max(250);
    }
    pub fn slower(&mut self) {
        self.interval_ms = (self.interval_ms + 250).min(10_000);
    }
}

fn push_bounded(v: &mut VecDeque<u64>, x: u64) {
    if v.len() == HISTORY_LEN {
        v.pop_front();
    }
    v.push_back(x);
}

fn match_filter(c: &Conn, f: &str) -> bool {
    c.process.to_lowercase().contains(f)
        || c.port.to_string().contains(f)
        || c.proto.to_lowercase().contains(f)
        || c.state.to_lowercase().contains(f)
        || c.user.to_lowercase().contains(f)
        || c.local.to_lowercase().contains(f)
        || c.remote.to_lowercase().contains(f)
        || c.service.to_lowercase().contains(f)
        || c.pid.map(|p| p.to_string().contains(f)).unwrap_or(false)
}
