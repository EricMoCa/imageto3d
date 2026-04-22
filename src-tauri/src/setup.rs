/*!
Primera ejecución: instala Python, dependencias y descarga el modelo TRELLIS.
Cada paso emite mensajes SSE a través de `server::broadcast_setup_event`.

Pasos:
  1. Extraer uv.exe a AppData
  2. uv python install 3.10
  3. uv venv <env_dir> --python 3.10
  4. pip install torch (CUDA 12.1)
  5. pip install -r requirements_worker.txt
  6. python -m scripts.download_model
  7. Marcar setup como completo → arrancar worker
*/

use crate::{server, worker};
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tracing::{error, info};

const TORCH_INDEX: &str = "https://download.pytorch.org/whl/cu121";
const TORCH_PKG: &str = "torch==2.4.0 torchvision==0.19.0 torchaudio==2.4.0";

pub async fn run(handle: AppHandle, app_data_dir: PathBuf, resource_dir: PathBuf) {
    if let Err(e) = run_inner(&handle, &app_data_dir, &resource_dir).await {
        let msg = format!("SETUP_ERROR:{e}");
        error!("{msg}");
        server::broadcast_setup_event(msg);
    }
}

async fn run_inner(
    handle: &AppHandle,
    app_data_dir: &PathBuf,
    resource_dir: &PathBuf,
) -> anyhow::Result<()> {
    let env_dir = app_data_dir.join("env");
    let models_dir = app_data_dir.join("models");
    let uv_dst = app_data_dir.join("uv.exe");

    std::fs::create_dir_all(app_data_dir)?;
    std::fs::create_dir_all(&models_dir)?;

    // ── Step 1: Extract uv.exe ─────────────────────────────────────────────
    server::broadcast_setup_event("PYTHON_START:Extrayendo uv.exe...");
    let uv_src = resource_dir.join("resources").join("uv.exe");
    if !uv_dst.exists() {
        std::fs::copy(&uv_src, &uv_dst)?;
    }
    info!("uv.exe at {}", uv_dst.display());

    // ── Step 2: Install Python 3.10 via uv ───────────────────────────────────
    server::broadcast_setup_event("PYTHON_START:Instalando Python 3.10...");
    run_cmd_streaming(
        &uv_dst,
        &["python", "install", "3.10"],
        app_data_dir,
        "PYTHON",
    )
    .await?;

    // ── Step 3: Create venv ───────────────────────────────────────────────────
    server::broadcast_setup_event("PYTHON_START:Creando entorno virtual...");
    if !env_dir.exists() {
        run_cmd_streaming(
            &uv_dst,
            &["venv", env_dir.to_str().unwrap(), "--python", "3.10"],
            app_data_dir,
            "PYTHON",
        )
        .await?;
    }
    server::broadcast_setup_event("PYTHON_DONE");

    // ── Step 4: Install PyTorch ───────────────────────────────────────────────
    server::broadcast_setup_event("DEPS_START:Instalando PyTorch (CUDA 12.1)...");
    let pip = env_dir.join("Scripts").join("pip.exe");
    let torch_args: Vec<&str> = {
        let mut v = vec!["install"];
        v.extend(TORCH_PKG.split_whitespace());
        v.extend(["--index-url", TORCH_INDEX]);
        v
    };
    run_cmd_streaming(&pip, &torch_args, app_data_dir, "DEPS").await?;

    // ── Step 5: Install worker requirements ───────────────────────────────────
    server::broadcast_setup_event("DEPS_START:Instalando dependencias del worker...");
    let req_src = resource_dir.join("resources").join("requirements_worker.txt");
    run_cmd_streaming(
        &pip,
        &["install", "-r", req_src.to_str().unwrap()],
        app_data_dir,
        "DEPS",
    )
    .await?;
    server::broadcast_setup_event("DEPS_DONE");

    // ── Step 6: Download model ────────────────────────────────────────────────
    server::broadcast_setup_event("DOWNLOAD_START:Descargando modelo TRELLIS...");
    let python = env_dir.join("Scripts").join("python.exe");
    // Resolve the project root (where scripts/ lives) — two levels up from resources
    let project_root: PathBuf = find_project_root(resource_dir);
    run_cmd_streaming_env(
        &python,
        &["-m", "scripts.download_model"],
        &project_root,
        "DOWNLOAD",
        &[("IMAGETO3D_MODELS_DIR", models_dir.to_str().unwrap())],
    )
    .await?;

    // ── Step 7: Mark complete ─────────────────────────────────────────────────
    std::fs::write(app_data_dir.join(".setup_complete"), "ok")?;
    server::broadcast_setup_event("SETUP_COMPLETE");
    info!("Setup complete — starting Python worker");

    // Start the worker process
    let output_dir = app_data_dir.join("outputs");
    let project_root = find_project_root(resource_dir);
    worker::start(handle.clone(), env_dir, models_dir, output_dir, project_root).await;

    Ok(())
}

// ── helpers ───────────────────────────────────────────────────────────────────

/// Walk up from `start` until we find a dir containing `backend/`. Fallback to start.
fn find_project_root(start: &Path) -> PathBuf {
    let mut current = start;
    loop {
        if current.join("backend").exists() {
            return current.to_path_buf();
        }
        match current.parent() {
            Some(parent) => current = parent,
            None => return start.to_path_buf(),
        }
    }
}

/// Run a command, stream stdout line-by-line as SSE events with a given prefix.
async fn run_cmd_streaming(
    exe: &Path,
    args: &[&str],
    cwd: &Path,
    prefix: &str,
) -> anyhow::Result<()> {
    run_cmd_streaming_env(exe, args, cwd, prefix, &[]).await
}

async fn run_cmd_streaming_env(
    exe: &Path,
    args: &[&str],
    cwd: &Path,
    prefix: &str,
    env: &[(&str, &str)],
) -> anyhow::Result<()> {
    info!("Running: {} {:?}", exe.display(), args);
    let mut cmd = Command::new(exe);
    cmd.args(args)
        .current_dir(cwd)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    for (k, v) in env {
        cmd.env(k, v);
    }

    let mut child = cmd.spawn()?;
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let prefix_owned = prefix.to_string();
    let t1 = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            server::broadcast_setup_event(format!("{prefix_owned}:{line}"));
        }
    });

    let prefix_owned2 = prefix.to_string();
    let t2 = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            server::broadcast_setup_event(format!("{prefix_owned2}:{line}"));
        }
    });

    let status = child.wait().await?;
    let _ = tokio::join!(t1, t2);

    if !status.success() {
        anyhow::bail!("Command failed with exit code {:?}", status.code());
    }
    Ok(())
}
