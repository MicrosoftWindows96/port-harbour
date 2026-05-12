//! portharbour: retro pixel-art terminal port visualiser.

mod app;
mod palette;
mod scan;
mod ui;

use std::time::{Duration, Instant};

use anyhow::Result;
use clap::Parser;
use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind, KeyModifiers};

use app::{App, KillTarget};

#[derive(Parser, Debug)]
#[command(
    name = "portharbour",
    version,
    about = "Live retro port visualiser",
    long_about = "Terminal port visualiser with neon retro styling. Shows which processes own which ports, with live stats, sparkline, top processes, filter, sort, and process kill."
)]
struct Cli {
    /// Refresh interval in milliseconds.
    #[arg(long, default_value_t = 1000)]
    interval: u64,

    /// Show all sockets (not just LISTEN) by default.
    #[arg(long)]
    all: bool,

    /// Hide retro banner on start.
    #[arg(long)]
    no_banner: bool,

    /// Hide stats panel on start.
    #[arg(long)]
    no_stats: bool,

    /// Emit a single JSON snapshot to stdout and exit. No TUI.
    #[arg(long)]
    once: bool,

    /// Stream JSON snapshots (one per line, NDJSON) to stdout. No TUI.
    /// Intended for the VS Code extension and other host apps.
    #[arg(long)]
    stream: bool,
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    if cli.once || cli.stream {
        return run_json(cli);
    }

    let mut terminal = ratatui::init();
    let res = run(&mut terminal, cli);
    ratatui::restore();
    if let Err(ref e) = res {
        eprintln!("portharbour error: {e:#}");
    }
    res
}

fn run_json(cli: Cli) -> Result<()> {
    use std::io::{stdout, Write};
    use std::thread::sleep;

    let mut scanner = scan::Scanner::new();
    let interval = Duration::from_millis(cli.interval.max(100));
    let listening_only = !cli.all;
    let mut out = stdout().lock();

    loop {
        let started = Instant::now();
        let conns = scanner.scan(listening_only)?;
        let snapshot = serde_json::json!({
            "ts": now_unix_ms(),
            "scan_ms": started.elapsed().as_millis() as u64,
            "listening_only": listening_only,
            "conns": conns,
        });
        serde_json::to_writer(&mut out, &snapshot)?;
        writeln!(&mut out)?;
        out.flush()?;
        if cli.once {
            return Ok(());
        }
        let used = started.elapsed();
        if let Some(rest) = interval.checked_sub(used) {
            sleep(rest);
        }
    }
}

fn now_unix_ms() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn run(terminal: &mut ratatui::DefaultTerminal, cli: Cli) -> Result<()> {
    let mut app = App::new();
    app.interval_ms = cli.interval.max(100);
    app.listening_only = !cli.all;
    app.show_banner = !cli.no_banner;
    app.show_stats = !cli.no_stats;

    app.tick();

    let mut last_tick = Instant::now();

    loop {
        terminal.draw(|f| ui::draw(f, &mut app))?;

        let elapsed = last_tick.elapsed();
        let timeout = Duration::from_millis(app.interval_ms)
            .checked_sub(elapsed)
            .unwrap_or(Duration::ZERO);

        if event::poll(timeout.max(Duration::from_millis(50)))? {
            match event::read()? {
                Event::Key(k) if k.kind == KeyEventKind::Press => handle_key(&mut app, k)?,
                Event::Resize(_, _) => {}
                _ => {}
            }
        }

        if last_tick.elapsed() >= Duration::from_millis(app.interval_ms) {
            app.tick();
            last_tick = Instant::now();
        }

        if app.should_quit {
            break;
        }
    }
    Ok(())
}

fn handle_key(app: &mut App, k: KeyEvent) -> Result<()> {
    if app.confirm_kill.is_some() {
        return handle_kill_key(app, k);
    }
    if app.show_help {
        if matches!(
            k.code,
            KeyCode::Esc | KeyCode::Char('q') | KeyCode::Char('?')
        ) {
            app.show_help = false;
        }
        return Ok(());
    }
    if app.filter_mode {
        return handle_filter_key(app, k);
    }

    match (k.code, k.modifiers) {
        (KeyCode::Char('q'), _) | (KeyCode::Char('c'), KeyModifiers::CONTROL) => {
            app.should_quit = true;
        }
        (KeyCode::Char('?'), _) => app.show_help = true,
        (KeyCode::Char('r'), _) => app.tick(),
        (KeyCode::Char('p'), _) => app.paused = !app.paused,
        (KeyCode::Char('a'), _) => {
            app.listening_only = !app.listening_only;
            app.tick();
        }
        (KeyCode::Char('g'), _) => app.show_stats = !app.show_stats,
        (KeyCode::Char('b'), _) => app.show_banner = !app.show_banner,
        (KeyCode::Char('s'), KeyModifiers::SHIFT) | (KeyCode::Char('S'), _) => {
            app.sort_reverse = !app.sort_reverse;
            app.apply_filter_and_sort();
        }
        (KeyCode::Char('s'), _) => {
            app.sort_key = app.sort_key.next();
            app.apply_filter_and_sort();
        }
        (KeyCode::Char('/'), _) => app.filter_mode = true,
        (KeyCode::Esc, _) if !app.filter.is_empty() => {
            app.filter.clear();
            app.apply_filter_and_sort();
        }
        (KeyCode::Char('k'), KeyModifiers::NONE) => prompt_kill(app),
        (KeyCode::Char('y'), _) => copy_pid(app),
        (KeyCode::Char('+'), _) | (KeyCode::Char('='), _) => app.faster(),
        (KeyCode::Char('-'), _) | (KeyCode::Char('_'), _) => app.slower(),
        (KeyCode::Down, _) | (KeyCode::Char('j'), _) => app.cursor_down(),
        (KeyCode::Up, _) | (KeyCode::Char('k'), KeyModifiers::SHIFT) => app.cursor_up(),
        (KeyCode::PageDown, _) => app.cursor_page(1, 10),
        (KeyCode::PageUp, _) => app.cursor_page(-1, 10),
        (KeyCode::Home, _) => app.cursor_home(),
        (KeyCode::End, _) => app.cursor_end(),
        _ => {}
    }
    Ok(())
}

fn handle_filter_key(app: &mut App, k: KeyEvent) -> Result<()> {
    match k.code {
        KeyCode::Esc => {
            app.filter_mode = false;
            app.filter.clear();
            app.apply_filter_and_sort();
        }
        KeyCode::Enter => {
            app.filter_mode = false;
        }
        KeyCode::Backspace => {
            app.filter.pop();
            app.apply_filter_and_sort();
        }
        KeyCode::Char(c) => {
            app.filter.push(c);
            app.apply_filter_and_sort();
        }
        _ => {}
    }
    Ok(())
}

fn handle_kill_key(app: &mut App, k: KeyEvent) -> Result<()> {
    match k.code {
        KeyCode::Char('y') | KeyCode::Char('Y') | KeyCode::Enter => {
            if let Some(target) = app.confirm_kill.take() {
                send_sigterm(app, target);
            }
        }
        KeyCode::Esc | KeyCode::Char('n') | KeyCode::Char('N') | KeyCode::Char('q') => {
            app.confirm_kill = None;
        }
        _ => {}
    }
    Ok(())
}

fn prompt_kill(app: &mut App) {
    let target = app.selected_conn().and_then(|c| {
        c.pid.map(|pid| KillTarget {
            pid,
            name: c.process.clone(),
            port: c.port,
        })
    });
    match target {
        Some(t) => app.confirm_kill = Some(t),
        None => app.set_toast("no PID on selected row".into()),
    }
}

fn send_sigterm(app: &mut App, target: KillTarget) {
    #[cfg(unix)]
    {
        use std::os::raw::c_int;
        unsafe extern "C" {
            fn kill(pid: c_int, sig: c_int) -> c_int;
        }
        const SIGTERM: c_int = 15;
        let r = unsafe { kill(target.pid as c_int, SIGTERM) };
        if r == 0 {
            app.set_toast(format!("SIGTERM → {} (PID {})", target.name, target.pid));
        } else {
            let err = std::io::Error::last_os_error();
            app.set_toast(format!("kill failed: {err}"));
        }
    }
    #[cfg(windows)]
    {
        let status = std::process::Command::new("taskkill")
            .args(["/PID", &target.pid.to_string(), "/F"])
            .status();
        match status {
            Ok(s) if s.success() => {
                app.set_toast(format!("killed {} (PID {})", target.name, target.pid));
            }
            Ok(s) => app.set_toast(format!("taskkill exit {s}")),
            Err(e) => app.set_toast(format!("kill failed: {e}")),
        }
    }
    app.tick();
}

#[cfg(feature = "clipboard")]
fn copy_pid(app: &mut App) {
    let Some(pid) = app.selected_conn().and_then(|c| c.pid) else {
        app.set_toast("no PID on selected row".into());
        return;
    };
    match arboard::Clipboard::new().and_then(|mut cb| cb.set_text(pid.to_string())) {
        Ok(_) => app.set_toast(format!("PID {pid} → clipboard")),
        Err(e) => app.set_toast(format!("clipboard error: {e}")),
    }
}

#[cfg(not(feature = "clipboard"))]
fn copy_pid(app: &mut App) {
    app.set_toast("clipboard feature disabled".into());
}
