/*!
Python worker lifecycle: spawn, health-poll, navigate window, kill on exit.

The worker runs on port 8001 and only accepts connections from 127.0.0.1.
*/

use crate::server;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tokio::process::Command;
use tokio::time::{sleep, Duration, Instant};
use tracing::{error, info, warn};

const WORKER_PORT: u16 = 8001;
const HEALTH_TIMEOUT_SECS: u64 = 300; // 5 min — model load can be slow
const HEALTH_POLL_INTERVAL_MS: u64 = 2000;

/// Show the main window unconditionally. Called both on success and on error
/// so the user always sees the UI rather than a frozen taskbar icon.
fn show_window(handle: &AppHandle) {
    if let Some(window) = handle.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub async fn start(
    handle: AppHandle,
    env_dir: PathBuf,
    models_dir: PathBuf,
    output_dir: PathBuf,
    project_root: PathBuf,
) {
    // uv venvs put python in Scripts/; conda puts it at the root
    let python = if env_dir.join("Scripts").join("python.exe").exists() {
        env_dir.join("Scripts").join("python.exe")
    } else if env_dir.join("python.exe").exists() {
        env_dir.join("python.exe")
    } else {
        error!("Python not found in {} (checked Scripts/ and root)", env_dir.display());
        server::broadcast_setup_event("WORKER_ERROR:Python not found in env directory");
        show_window(&handle);
        return;
    };
    info!("Using Python: {}", python.display());
    info!("Project root: {}", project_root.display());

    // Build PYTHONPATH: project_root + sam-3d-objects (TRELLIS source)
    // This ensures backend/ and TRELLIS are importable regardless of cwd.
    let trellis_path = project_root.join("sam-3d-objects");
    let pythonpath = if trellis_path.exists() {
        format!("{};{}", project_root.display(), trellis_path.display())
    } else {
        project_root.to_string_lossy().to_string()
    };
    info!("PYTHONPATH: {}", pythonpath);

    info!("Spawning Python worker on port {WORKER_PORT}...");
    server::broadcast_setup_event("WORKER_START:Iniciando worker Python...");

    let mut child = match Command::new(&python)
        .args([
            "-m",
            "uvicorn",
            "backend.worker:app",
            "--host",
            "127.0.0.1",
            "--port",
            &WORKER_PORT.to_string(),
            "--no-access-log",
        ])
        .current_dir(&project_root)
        .env("ATTN_BACKEND", "xformers")
        .env("IMAGETO3D_MODELS_DIR", models_dir.to_str().unwrap_or(""))
        .env("IMAGETO3D_OUTPUT_DIR", output_dir.to_str().unwrap_or(""))
        .env("PYTORCH_CUDA_ALLOC_CONF", "max_split_size_mb:512")
        .env("PYTHONPATH", &pythonpath)
        .kill_on_drop(true)
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            error!("Failed to spawn Python worker: {e}");
            server::broadcast_setup_event(format!("WORKER_ERROR:{e}"));
            show_window(&handle);
            return;
        }
    };

    info!("Worker PID: {:?}", child.id());

    // Poll /worker-health until ready or timeout.
    // Also watch for the process dying immediately (import error, missing module, etc.)
    let deadline = Instant::now() + Duration::from_secs(HEALTH_TIMEOUT_SECS);
    let client = reqwest::Client::new();
    let health_url = format!("http://127.0.0.1:{WORKER_PORT}/worker-health");

    loop {
        if Instant::now() > deadline {
            error!("Worker health timeout after {HEALTH_TIMEOUT_SECS}s");
            server::broadcast_setup_event("WORKER_ERROR:Health check timeout — model may be loading");
            child.kill().await.ok();
            show_window(&handle);
            return;
        }

        // Check if process already exited (immediate crash)
        match child.try_wait() {
            Ok(Some(status)) => {
                error!("Worker exited immediately with: {status}");
                server::broadcast_setup_event(format!(
                    "WORKER_ERROR:Worker crashed on startup (exit {}). Check that backend/ is accessible and all Python deps are installed.",
                    status
                ));
                show_window(&handle);
                return;
            }
            Ok(None) => {} // still running
            Err(e) => warn!("try_wait error: {e}"),
        }

        match client.get(&health_url).timeout(Duration::from_secs(5)).send().await {
            Ok(resp) if resp.status().is_success() => {
                info!("Worker is healthy");
                break;
            }
            _ => {
                sleep(Duration::from_millis(HEALTH_POLL_INTERVAL_MS)).await;
            }
        }
    }

    // Mark worker ready so Axum starts proxying.
    server::set_worker_ready(true);
    server::broadcast_setup_event("WORKER_READY");
    show_window(&handle);

    // Wait for the worker process to exit (shouldn't happen normally).
    match child.wait().await {
        Ok(status) => {
            warn!("Python worker exited with status: {status}");
            server::set_worker_ready(false);
            server::broadcast_setup_event(format!("WORKER_ERROR:Worker exited ({status})"));
        }
        Err(e) => {
            error!("Error waiting for worker: {e}");
        }
    }
}
