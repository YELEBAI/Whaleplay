// Prevents an extra console window on Windows for both dev and release builds.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

fn main() {
    neo_tavern_desktop_lib::run()
}
