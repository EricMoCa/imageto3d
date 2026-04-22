mod cleanup;
mod server;
mod setup;
mod worker;

use std::path::PathBuf;
use tauri::{App, Manager};
use tracing::info;

/// Main entry point called from main.rs.
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "imageto3d=info,axum=info".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_data_dir = app_data_dir(app);
            let env_dir = app_data_dir.join("env");
            let models_dir = app_data_dir.join("models");
            let output_dir = app_data_dir.join("outputs");
            // Marker is placed at app_data_dir/.setup_complete (not inside env/)
            // to avoid polluting the Python venv directory.
            let setup_done = app_data_dir.join(".setup_complete").exists()
                || env_dir.join(".setup_complete").exists();

            let resource_dir = app.path().resource_dir()
                .expect("Cannot resolve resource dir");
            // Find the project root: the nearest ancestor that contains backend/
            // In dev: resource_dir = src-tauri/target/debug → walk up 3 levels
            // In prod: install dir has backend/ directly adjacent
            let project_root = find_project_root(&resource_dir);

            info!("App data dir: {}", app_data_dir.display());
            info!("Project root: {}", project_root.display());
            info!("Setup complete: {}", setup_done);

            // Ensure output dir exists
            std::fs::create_dir_all(&output_dir).ok();

            // Start Axum HTTP server on port 8000 (always running).
            let handle = app.handle().clone();
            let output_dir_clone = output_dir.clone();
            tauri::async_runtime::spawn(async move {
                server::start(handle, output_dir_clone).await;
            });

            // Background GLB cleanup task
            let output_dir_for_cleanup = output_dir.clone();
            tauri::async_runtime::spawn(async move {
                cleanup::run(output_dir_for_cleanup).await;
            });

            // Kick off setup or start worker.
            let handle2 = app.handle().clone();
            if !setup_done {
                info!("First run — starting setup wizard");
                let resource_dir_clone = resource_dir.clone();
                tauri::async_runtime::spawn(async move {
                    setup::run(handle2, app_data_dir, resource_dir_clone).await;
                });
            } else {
                info!("Env exists — starting Python worker");
                tauri::async_runtime::spawn(async move {
                    worker::start(handle2, env_dir, models_dir, output_dir, project_root).await;
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}

/// Returns %APPDATA%\Imageto3D on Windows, ~/Library/Application Support/Imageto3D on macOS.
fn app_data_dir(app: &App) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("Cannot resolve app data directory")
}

/// Walk up from `start` until we find a directory that contains a `backend/` subdirectory.
/// Falls back to `start` if nothing is found.
fn find_project_root(start: &PathBuf) -> PathBuf {
    let mut current = start.as_path();
    loop {
        if current.join("backend").exists() {
            return current.to_path_buf();
        }
        match current.parent() {
            Some(parent) => current = parent,
            None => return start.clone(),
        }
    }
}
