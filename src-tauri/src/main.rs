// Tauri requires a special Windows subsystem entry point.
// The actual application logic lives in lib.rs.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    imageto3d_lib::run();
}
