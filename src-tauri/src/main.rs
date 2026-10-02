// Windows release builds must not spawn a console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    turbo_reader_lib::run()
}
