//! Synthwave neon palette. CRT vibes.

use ratatui::style::Color;

pub const BG: Color = Color::Rgb(8, 4, 24);
pub const BG_ALT: Color = Color::Rgb(20, 8, 40);
pub const PANEL: Color = Color::Rgb(14, 6, 32);
pub const FRAME: Color = Color::Rgb(255, 0, 170);
pub const FRAME_DIM: Color = Color::Rgb(120, 30, 110);

pub const NEON_PINK: Color = Color::Rgb(255, 0, 170);
pub const NEON_CYAN: Color = Color::Rgb(0, 245, 255);
pub const NEON_GREEN: Color = Color::Rgb(57, 255, 20);
pub const NEON_YELLOW: Color = Color::Rgb(255, 222, 60);
pub const NEON_PURPLE: Color = Color::Rgb(180, 100, 255);
pub const NEON_RED: Color = Color::Rgb(255, 64, 96);
pub const NEON_ORANGE: Color = Color::Rgb(255, 140, 40);

pub const TEXT: Color = Color::Rgb(220, 220, 240);
pub const TEXT_DIM: Color = Color::Rgb(140, 130, 170);

/// Color for a row by port category.
pub fn port_color(port: u16) -> Color {
    if port < 1024 {
        NEON_RED
    } else if port < 49152 {
        NEON_YELLOW
    } else {
        NEON_GREEN
    }
}

/// Color for connection state.
pub fn state_color(state: &str) -> Color {
    match state {
        "LISTEN" => NEON_GREEN,
        "ESTABLISHED" => NEON_CYAN,
        "TIME_WAIT" | "CLOSE_WAIT" => NEON_YELLOW,
        "CLOSED" | "FIN_WAIT_1" | "FIN_WAIT_2" | "LAST_ACK" => NEON_RED,
        _ => TEXT_DIM,
    }
}

/// Rotating accent for top-procs bars.
pub fn rotating_neon(idx: usize) -> Color {
    const COLORS: [Color; 5] = [NEON_PINK, NEON_CYAN, NEON_PURPLE, NEON_GREEN, NEON_YELLOW];
    COLORS[idx % COLORS.len()]
}
