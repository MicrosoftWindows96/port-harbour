//! Rendering. Retro neon pixel-art look.

use ratatui::layout::{Alignment, Constraint, Direction, Layout, Rect};
use ratatui::style::{Modifier, Style, Stylize};
use ratatui::symbols;
use ratatui::text::{Line, Span};
use ratatui::widgets::{
    Block, BorderType, Borders, Cell, Clear, Paragraph, Row, Sparkline, Table, Wrap,
};
use ratatui::Frame;

use crate::app::App;
use crate::palette as p;
use crate::scan::Conn;

const BANNER: [&str; 5] = [
    "█▀█ █▀█ █▀█ ▀█▀   █ █ █ ▀█",
    "█▀▀ █▄█ █▀▄  █    ▀▄▀ █ █▄",
    "                          ",
    "  ░▒▓ live port radar ▓▒░ ",
    "                          ",
];

const SCAN_GLYPHS: [&str; 4] = ["◢", "◣", "◤", "◥"];

pub fn draw(f: &mut Frame, app: &mut App) {
    let bg = Block::new().style(Style::default().bg(p::BG).fg(p::TEXT));
    f.render_widget(bg, f.area());

    let banner_h: u16 = if app.show_banner { 5 } else { 0 };
    let stats_h: u16 = if app.show_stats { 9 } else { 0 };
    let filter_h: u16 = if app.filter_mode || !app.filter.is_empty() {
        3
    } else {
        0
    };

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(banner_h),
            Constraint::Length(1),
            Constraint::Length(stats_h),
            Constraint::Length(filter_h),
            Constraint::Min(5),
            Constraint::Length(1),
        ])
        .split(f.area());

    if app.show_banner {
        draw_banner(f, chunks[0], app);
    }
    draw_topbar(f, chunks[1], app);
    if app.show_stats {
        draw_stats(f, chunks[2], app);
    }
    if filter_h > 0 {
        draw_filter(f, chunks[3], app);
    }
    draw_table(f, chunks[4], app);
    draw_status(f, chunks[5], app);

    if let Some(target) = app.confirm_kill.clone() {
        draw_kill_modal(f, &target);
    }
    if app.show_help {
        draw_help_modal(f);
    }
    if let Some(msg) = app.toast_active() {
        draw_toast(f, msg);
    }
}

fn draw_banner(f: &mut Frame, area: Rect, app: &App) {
    let phase = (app.tick / 2) as usize;
    let cols = [p::NEON_PINK, p::NEON_CYAN, p::NEON_PURPLE, p::NEON_GREEN];
    let mut lines: Vec<Line> = Vec::new();
    for (i, raw) in BANNER.iter().enumerate() {
        let style = Style::default()
            .fg(cols[(i + phase) % cols.len()])
            .add_modifier(Modifier::BOLD);
        lines.push(Line::from(Span::styled((*raw).to_string(), style)));
    }
    let para = Paragraph::new(lines)
        .alignment(Alignment::Center)
        .style(Style::default().bg(p::BG));
    f.render_widget(para, area);
}

fn draw_topbar(f: &mut Frame, area: Rect, app: &App) {
    let glyph = SCAN_GLYPHS[(app.tick as usize) % SCAN_GLYPHS.len()];
    let state = if app.paused {
        Span::styled("◼ PAUSED", Style::default().fg(p::NEON_RED).bold())
    } else {
        Span::styled(
            format!("{glyph} LIVE {:>4}ms", app.interval_ms),
            Style::default().fg(p::NEON_GREEN).bold(),
        )
    };
    let scope = if app.listening_only { "LISTEN" } else { "ALL" };
    let sort_arrow = if app.sort_reverse { "▼" } else { "▲" };
    let scan_ms = format!("scan {:>3}ms", app.last_scan_ms);

    let bar = Line::from(vec![
        Span::raw(" "),
        state,
        Span::raw("  "),
        Span::styled("scope=", Style::default().fg(p::TEXT_DIM)),
        Span::styled(scope, Style::default().fg(p::NEON_CYAN).bold()),
        Span::raw("  "),
        Span::styled("sort=", Style::default().fg(p::TEXT_DIM)),
        Span::styled(
            format!("{} {}", app.sort_key.label(), sort_arrow),
            Style::default().fg(p::NEON_YELLOW).bold(),
        ),
        Span::raw("  "),
        Span::styled("rows=", Style::default().fg(p::TEXT_DIM)),
        Span::styled(
            format!("{}", app.filtered.len()),
            Style::default().fg(p::NEON_PINK).bold(),
        ),
        Span::raw("  "),
        Span::styled(scan_ms, Style::default().fg(p::TEXT_DIM)),
        Span::raw("  "),
        Span::styled(
            if app.filter.is_empty() {
                String::new()
            } else {
                format!("filter='{}'", app.filter)
            },
            Style::default().fg(p::NEON_PURPLE).italic(),
        ),
    ]);

    let para = Paragraph::new(bar).style(Style::default().bg(p::BG_ALT));
    f.render_widget(para, area);
}

fn draw_stats(f: &mut Frame, area: Rect, app: &App) {
    let cols = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Length(32),
            Constraint::Min(20),
            Constraint::Length(40),
        ])
        .split(area);

    draw_stats_counts(f, cols[0], app);
    draw_stats_spark(f, cols[1], app);
    draw_stats_top(f, cols[2], app);
}

fn neon_block(title: &str, color: ratatui::style::Color) -> Block<'_> {
    Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Double)
        .border_style(Style::default().fg(color))
        .style(Style::default().bg(p::PANEL).fg(p::TEXT))
        .title(Span::styled(
            format!(" {title} "),
            Style::default().fg(color).bold(),
        ))
}

fn draw_stats_counts(f: &mut Frame, area: Rect, app: &App) {
    let block = neon_block("STATS", p::FRAME);
    let inner = block.inner(area);
    f.render_widget(block, area);

    let now = app.conns.len() as u64;
    let lines = vec![
        Line::from(vec![
            Span::styled("TOTAL  ", Style::default().fg(p::TEXT_DIM)),
            Span::styled(
                format!("{now:>4}"),
                Style::default().fg(p::NEON_CYAN).bold(),
            ),
            Span::styled("   PEAK ", Style::default().fg(p::TEXT_DIM)),
            Span::styled(
                format!("{}", app.peak_total),
                Style::default().fg(p::NEON_PINK).bold(),
            ),
        ]),
        Line::from(vec![
            Span::styled("TCP    ", Style::default().fg(p::TEXT_DIM)),
            Span::styled(
                format!("{:>4}", app.tcp_count),
                Style::default().fg(p::NEON_GREEN).bold(),
            ),
            Span::styled("   UDP  ", Style::default().fg(p::TEXT_DIM)),
            Span::styled(
                format!("{}", app.udp_count),
                Style::default().fg(p::NEON_ORANGE).bold(),
            ),
        ]),
        Line::from(vec![
            Span::styled("LISTEN ", Style::default().fg(p::TEXT_DIM)),
            Span::styled(
                format!("{:>4}", app.listen_count),
                Style::default().fg(p::NEON_GREEN).bold(),
            ),
            Span::styled("   EST  ", Style::default().fg(p::TEXT_DIM)),
            Span::styled(
                format!("{}", app.estab_count),
                Style::default().fg(p::NEON_CYAN).bold(),
            ),
        ]),
        Line::from(vec![
            Span::styled("PROCS  ", Style::default().fg(p::TEXT_DIM)),
            Span::styled(
                format!("{:>4}", app.top_procs.len()),
                Style::default().fg(p::NEON_PURPLE).bold(),
            ),
            Span::styled("   IPv6 ", Style::default().fg(p::TEXT_DIM)),
            Span::styled(
                format!("{}", app.ipv6_count),
                Style::default().fg(p::NEON_YELLOW).bold(),
            ),
        ]),
    ];
    let para = Paragraph::new(lines).wrap(Wrap { trim: false });
    f.render_widget(para, inner);
}

fn draw_stats_spark(f: &mut Frame, area: Rect, app: &App) {
    let block = neon_block("HISTORY", p::NEON_CYAN);
    let inner = block.inner(area);
    f.render_widget(block, area);

    let split = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(1), Constraint::Min(1)])
        .split(inner);

    let now = app.conns.len();
    let max_h = app
        .hist_total
        .iter()
        .copied()
        .max()
        .unwrap_or(1)
        .max(app.peak_total)
        .max(1);
    let label = Line::from(vec![
        Span::styled("now ", Style::default().fg(p::TEXT_DIM)),
        Span::styled(format!("{now}"), Style::default().fg(p::NEON_CYAN).bold()),
        Span::styled("  max ", Style::default().fg(p::TEXT_DIM)),
        Span::styled(format!("{max_h}"), Style::default().fg(p::NEON_PINK).bold()),
        Span::styled("  span ", Style::default().fg(p::TEXT_DIM)),
        Span::styled(
            format!(
                "{}s",
                (app.hist_total.len() as u64 * app.interval_ms) / 1000
            ),
            Style::default().fg(p::NEON_YELLOW),
        ),
    ]);
    f.render_widget(Paragraph::new(label), split[0]);

    let data: Vec<u64> = app.hist_total.iter().copied().collect();
    let spark = Sparkline::default()
        .data(&data)
        .max(max_h)
        .style(Style::default().fg(p::NEON_CYAN))
        .bar_set(symbols::bar::NINE_LEVELS);
    f.render_widget(spark, split[1]);
}

fn draw_stats_top(f: &mut Frame, area: Rect, app: &App) {
    let block = neon_block("TOP PROCS", p::NEON_PINK);
    let inner = block.inner(area);
    f.render_widget(block, area);

    let max = app.top_procs.first().map(|t| t.count).unwrap_or(1).max(1);
    let bar_width = inner.width.saturating_sub(20) as usize;
    let mut lines: Vec<Line> = Vec::new();
    for (i, t) in app.top_procs.iter().enumerate() {
        let frac = (t.count as f32 / max as f32).clamp(0.0, 1.0);
        let cells = ((frac * bar_width as f32).round() as usize).max(1);
        let bar = "█".repeat(cells);
        let pad = " ".repeat(bar_width.saturating_sub(cells));
        let color = p::rotating_neon(i);
        let name = truncate(&t.name, 10);
        lines.push(Line::from(vec![
            Span::styled(format!("{name:<10} "), Style::default().fg(p::TEXT).bold()),
            Span::styled(bar, Style::default().fg(color)),
            Span::raw(pad),
            Span::styled(
                format!(" {:>3}", t.count),
                Style::default().fg(color).bold(),
            ),
        ]));
    }
    if lines.is_empty() {
        lines.push(Line::from(Span::styled(
            "no data",
            Style::default().fg(p::TEXT_DIM),
        )));
    }
    f.render_widget(Paragraph::new(lines), inner);
}

fn draw_filter(f: &mut Frame, area: Rect, app: &App) {
    let title = if app.filter_mode {
        " FILTER (Esc to clear, Enter to apply) "
    } else {
        " FILTER "
    };
    let color = if app.filter_mode {
        p::NEON_YELLOW
    } else {
        p::FRAME_DIM
    };
    let block = neon_block(title, color);
    let inner = block.inner(area);
    f.render_widget(block, area);
    let cursor = if app.filter_mode { "▌" } else { "" };
    let text = Line::from(vec![
        Span::styled("▶ ", Style::default().fg(p::NEON_PINK).bold()),
        Span::styled(app.filter.clone(), Style::default().fg(p::NEON_CYAN).bold()),
        Span::styled(cursor, Style::default().fg(p::NEON_PINK)),
    ]);
    f.render_widget(Paragraph::new(text), inner);
}

fn draw_table(f: &mut Frame, area: Rect, app: &mut App) {
    let block = neon_block("PORTS", p::NEON_PINK);
    let inner = block.inner(area);
    f.render_widget(block, area);

    let header = Row::new(vec![
        h("PORT"),
        h("SVC"),
        h("PROTO"),
        h("STATE"),
        h("PID"),
        h("PROCESS"),
        h("USER"),
        h("LOCAL"),
        h("REMOTE"),
    ])
    .style(Style::default().fg(p::NEON_PINK).bold())
    .height(1)
    .bottom_margin(0);

    let rows: Vec<Row> = app
        .filtered
        .iter()
        .map(|i| row_for(&app.conns[*i]))
        .collect();

    let widths = [
        Constraint::Length(6),
        Constraint::Length(10),
        Constraint::Length(5),
        Constraint::Length(12),
        Constraint::Length(7),
        Constraint::Length(18),
        Constraint::Length(10),
        Constraint::Min(20),
        Constraint::Min(20),
    ];

    let table = Table::new(rows, widths)
        .header(header)
        .row_highlight_style(
            Style::default()
                .bg(p::FRAME)
                .fg(p::BG)
                .add_modifier(Modifier::BOLD),
        )
        .highlight_symbol("▶ ")
        .column_spacing(1)
        .style(Style::default().bg(p::PANEL));

    f.render_stateful_widget(table, inner, &mut app.table_state);
}

fn row_for(c: &Conn) -> Row<'static> {
    let port_color = p::port_color(c.port);
    let state_color = p::state_color(&c.state);
    let proto = if c.ipv6 {
        format!("{}6", c.proto)
    } else {
        c.proto.to_string()
    };
    Row::new(vec![
        Cell::from(Span::styled(
            c.port.to_string(),
            Style::default().fg(port_color).bold(),
        )),
        Cell::from(Span::styled(
            if c.service.is_empty() {
                "·".to_string()
            } else {
                c.service.to_string()
            },
            Style::default().fg(p::NEON_PURPLE),
        )),
        Cell::from(Span::styled(proto, Style::default().fg(p::NEON_ORANGE))),
        Cell::from(Span::styled(
            c.state.clone(),
            Style::default().fg(state_color),
        )),
        Cell::from(Span::styled(
            c.pid.map(|p| p.to_string()).unwrap_or("·".into()),
            Style::default().fg(p::TEXT),
        )),
        Cell::from(Span::styled(
            truncate(&c.process, 18),
            Style::default().fg(p::NEON_CYAN),
        )),
        Cell::from(Span::styled(
            truncate(&c.user, 10),
            Style::default().fg(p::TEXT_DIM),
        )),
        Cell::from(Span::styled(c.local.clone(), Style::default().fg(p::TEXT))),
        Cell::from(Span::styled(
            c.remote.clone(),
            Style::default().fg(p::TEXT_DIM),
        )),
    ])
}

fn h(s: &'static str) -> Cell<'static> {
    Cell::from(Span::styled(s, Style::default().fg(p::NEON_PINK).bold()))
}

fn draw_status(f: &mut Frame, area: Rect, _app: &App) {
    let line = Line::from(vec![
        Span::styled("●", Style::default().fg(p::NEON_RED)),
        Span::raw(" sys<1024  "),
        Span::styled("●", Style::default().fg(p::NEON_YELLOW)),
        Span::raw(" reg<49152  "),
        Span::styled("●", Style::default().fg(p::NEON_GREEN)),
        Span::raw(" dyn≥49152  │  "),
        Span::styled("?", Style::default().fg(p::NEON_CYAN).bold()),
        Span::raw(" help  "),
        Span::styled("k", Style::default().fg(p::NEON_PINK).bold()),
        Span::raw(" kill  "),
        Span::styled("/", Style::default().fg(p::NEON_PINK).bold()),
        Span::raw(" filter  "),
        Span::styled("s", Style::default().fg(p::NEON_PINK).bold()),
        Span::raw(" sort  "),
        Span::styled("a", Style::default().fg(p::NEON_PINK).bold()),
        Span::raw(" scope  "),
        Span::styled("p", Style::default().fg(p::NEON_PINK).bold()),
        Span::raw(" pause  "),
        Span::styled("q", Style::default().fg(p::NEON_PINK).bold()),
        Span::raw(" quit"),
    ]);
    let para = Paragraph::new(line).style(Style::default().bg(p::BG_ALT).fg(p::TEXT_DIM));
    f.render_widget(para, area);
}

fn draw_kill_modal(f: &mut Frame, target: &crate::app::KillTarget) {
    let area = centered_rect(60, 30, f.area());
    f.render_widget(Clear, area);
    let block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Double)
        .border_style(Style::default().fg(p::NEON_RED).bold())
        .title(Span::styled(
            " ⚠  KILL PROCESS ",
            Style::default().fg(p::NEON_RED).bold(),
        ))
        .style(Style::default().bg(p::BG_ALT));
    let inner = block.inner(area);
    f.render_widget(block, area);

    let lines = vec![
        Line::from(""),
        Line::from(Span::styled(
            format!("SIGTERM → PID {} ({})", target.pid, target.name),
            Style::default().fg(p::NEON_YELLOW).bold(),
        ))
        .alignment(Alignment::Center),
        Line::from(Span::styled(
            format!("holding port {}", target.port),
            Style::default().fg(p::TEXT_DIM),
        ))
        .alignment(Alignment::Center),
        Line::from(""),
        Line::from(vec![
            Span::styled("[Y]", Style::default().fg(p::NEON_RED).bold()),
            Span::raw(" confirm   "),
            Span::styled("[N/Esc]", Style::default().fg(p::NEON_CYAN).bold()),
            Span::raw(" cancel"),
        ])
        .alignment(Alignment::Center),
    ];
    f.render_widget(Paragraph::new(lines), inner);
}

fn draw_help_modal(f: &mut Frame) {
    let area = centered_rect(60, 70, f.area());
    f.render_widget(Clear, area);
    let block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Double)
        .border_style(Style::default().fg(p::NEON_CYAN).bold())
        .title(Span::styled(
            " ░▒▓ HELP ▓▒░ ",
            Style::default().fg(p::NEON_CYAN).bold(),
        ))
        .style(Style::default().bg(p::BG_ALT));
    let inner = block.inner(area);
    f.render_widget(block, area);

    let kb = |k: &str, d: &str| {
        Line::from(vec![
            Span::styled(
                format!("  {k:<10}"),
                Style::default().fg(p::NEON_PINK).bold(),
            ),
            Span::styled(d.to_string(), Style::default().fg(p::TEXT)),
        ])
    };
    let lines = vec![
        Line::from(Span::styled(
            "Navigation",
            Style::default().fg(p::NEON_YELLOW).bold(),
        )),
        kb("↑/k", "row up"),
        kb("↓/j", "row down"),
        kb("PgUp/PgDn", "page"),
        kb("Home/End", "first/last"),
        Line::from(""),
        Line::from(Span::styled(
            "Actions",
            Style::default().fg(p::NEON_YELLOW).bold(),
        )),
        kb("k", "kill selected PID (SIGTERM)"),
        kb("y", "copy selected PID to clipboard"),
        kb("r", "force refresh"),
        kb("p", "pause / resume"),
        kb("a", "toggle LISTEN/ALL scope"),
        kb("s", "cycle sort key"),
        kb("S", "reverse sort"),
        kb("/", "filter mode"),
        kb("Esc", "exit filter / close modal"),
        kb("+/-", "faster / slower refresh"),
        kb("g", "toggle stats panel"),
        kb("b", "toggle banner"),
        kb("?", "this help"),
        kb("q", "quit"),
    ];
    f.render_widget(Paragraph::new(lines), inner);
}

fn draw_toast(f: &mut Frame, msg: &str) {
    let area = f.area();
    let width = (msg.len() as u16 + 4).min(area.width.saturating_sub(4));
    let rect = Rect {
        x: area.x + area.width.saturating_sub(width + 2),
        y: area.y + area.height.saturating_sub(4),
        width,
        height: 3,
    };
    f.render_widget(Clear, rect);
    let block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(p::NEON_YELLOW))
        .style(Style::default().bg(p::BG_ALT));
    let inner = block.inner(rect);
    f.render_widget(block, rect);
    f.render_widget(
        Paragraph::new(Span::styled(
            msg.to_string(),
            Style::default().fg(p::NEON_YELLOW).bold(),
        ))
        .alignment(Alignment::Center),
        inner,
    );
}

fn centered_rect(pct_x: u16, pct_y: u16, r: Rect) -> Rect {
    let v = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Percentage((100 - pct_y) / 2),
            Constraint::Percentage(pct_y),
            Constraint::Percentage((100 - pct_y) / 2),
        ])
        .split(r);
    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage((100 - pct_x) / 2),
            Constraint::Percentage(pct_x),
            Constraint::Percentage((100 - pct_x) / 2),
        ])
        .split(v[1])[1]
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(max.saturating_sub(1)).collect();
        out.push('…');
        out
    }
}
