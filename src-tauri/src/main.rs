// Windows release builds must not spawn a console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // An AI agent starting Turbo Reader as an MCP server: no window at all.
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--mcp") {
        std::process::exit(turbo_reader_lib::run_mcp_stdio(
            args.iter().any(|a| a == "--allow-write"),
        ));
    }
    turbo_reader_lib::run()
}
