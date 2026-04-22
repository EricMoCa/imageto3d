//! Axum HTTP server on port 8000 — the single endpoint the WebView and users talk to.
//!
//! Routes:
//!   GET  /                     -> index.html (embedded at compile time)
//!   GET  /assets/{path}        -> frontend assets (embedded at compile time)
//!   GET  /files/{name}         -> GLB files from output_dir (runtime)
//!   GET  /health               -> { status, worker }
//!   GET  /setup-events         -> SSE stream of setup progress
//!   POST /generate-3d          -> proxy to Python worker /infer
//!   POST /generate-3d-multi    -> proxy to Python worker /infer-multi
//!
//! Frontend assets are embedded into the binary via include_dir! so the exe
//! is self-contained — no need to ship the frontend separately.

use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response, Sse},
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use futures_util::stream::Stream;
use include_dir::{include_dir, Dir};
use mime_guess::from_path;
use once_cell::sync::OnceCell;
use serde_json::{json, Value};
use std::{
    convert::Infallible,
    path::PathBuf,
    sync::{Arc, RwLock},
    time::Duration,
};
use tauri::AppHandle;
use tokio::sync::broadcast;
use tokio_stream::{wrappers::BroadcastStream, StreamExt as _};
use tracing::{error, info};
use uuid::Uuid;

// ── embedded frontend (compiled into binary) ───────────────────────────────────

/// The built React index.html — embedded at compile time.
/// `npm run build` must run before `cargo build`.
const INDEX_HTML: &str = include_str!("../../frontend/dist/index.html");

/// All assets from frontend/dist/assets/ embedded at compile time.
static FRONTEND_ASSETS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../frontend/dist/assets");

// ── shared state ───────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct AppState {
    pub output_dir: PathBuf,
    pub worker_ready: Arc<RwLock<bool>>,
    pub setup_tx: broadcast::Sender<String>,
}

impl AppState {
    pub fn new(output_dir: PathBuf) -> Self {
        let (tx, _) = broadcast::channel(256);
        Self {
            output_dir,
            worker_ready: Arc::new(RwLock::new(false)),
            setup_tx: tx,
        }
    }
}

pub type SharedState = Arc<AppState>;

/// Global server state — allows setup.rs and worker.rs to publish SSE events.
static STATE: OnceCell<SharedState> = OnceCell::new();

/// Start the Axum server on port 8000. This function never returns.
pub async fn start(_handle: AppHandle, output_dir: PathBuf) {
    let state = Arc::new(AppState::new(output_dir));
    STATE.set(state.clone()).ok();

    let app = Router::new()
        .route("/",                  get(serve_index))
        .route("/index.html",        get(serve_index))
        .route("/assets/*path",       get(serve_asset))
        .route("/files/{name}",      get(serve_file))
        .route("/health",            get(health))
        .route("/setup-events",      get(setup_events))
        .route("/generate-3d",       post(generate_3d))
        .route("/generate-3d-multi", post(generate_3d_multi))
        .with_state(state);

    let addr = "127.0.0.1:8000";
    info!("Axum listening on http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Cannot bind port 8000 — is another instance running?");
    axum::serve(listener, app).await.expect("Axum server error");
}

// ── SSE / state helpers ───────────────────────────────────────────────────────

/// Push an SSE message to all connected setup-events subscribers.
pub fn broadcast_setup_event(msg: impl Into<String>) {
    if let Some(state) = STATE.get() {
        let _ = state.setup_tx.send(msg.into());
    }
}

/// Update the worker-ready flag (reflected in /health and /generate-* routes).
pub fn set_worker_ready(ready: bool) {
    if let Some(state) = STATE.get() {
        *state.worker_ready.write().unwrap() = ready;
    }
}

// ── route handlers ─────────────────────────────────────────────────────────────

async fn serve_index() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
        INDEX_HTML,
    )
}

async fn serve_asset(Path(path): Path<String>) -> Response<Body> {
    // With `*path` wildcard, the extracted value may have a leading slash — strip it.
    let path = path.trim_start_matches('/').to_string();
    match FRONTEND_ASSETS.get_file(&path) {
        Some(file) => {
            let mime = from_path(&path).first_or_octet_stream();
            Response::builder()
                .status(StatusCode::OK)
                .header(
                    header::CONTENT_TYPE,
                    HeaderValue::from_str(mime.as_ref()).unwrap_or_else(|_| {
                        HeaderValue::from_static("application/octet-stream")
                    }),
                )
                .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
                .body(Body::from(file.contents()))
                .unwrap()
        }
        None => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::empty())
            .unwrap(),
    }
}

async fn serve_file(
    State(state): State<SharedState>,
    Path(name): Path<String>,
) -> Response<Body> {
    // Sanitise: only allow <uuid>.glb filenames.
    if !name.ends_with(".glb") || name.contains("..") || name.contains('/') || name.contains('\\') {
        return Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .body(Body::empty())
            .unwrap();
    }
    let path = state.output_dir.join(&name);
    match tokio::fs::read(&path).await {
        Ok(bytes) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "model/gltf-binary")
            .header(
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{name}\""),
            )
            .body(Body::from(bytes))
            .unwrap(),
        Err(_) => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::empty())
            .unwrap(),
    }
}

async fn health(State(state): State<SharedState>) -> Json<Value> {
    let worker = *state.worker_ready.read().unwrap();
    Json(json!({ "status": "ok", "worker": worker }))
}

async fn setup_events(
    State(state): State<SharedState>,
) -> Sse<impl Stream<Item = Result<axum::response::sse::Event, Infallible>>> {
    let rx = state.setup_tx.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|res| {
        res.ok().map(|msg| {
            Ok::<_, Infallible>(axum::response::sse::Event::default().data(msg))
        })
    });
    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("ping"),
    )
}

// ── /generate-3d ──────────────────────────────────────────────────────────────

async fn generate_3d(
    State(state): State<SharedState>,
    mut multipart: Multipart,
) -> Result<Json<Value>, (StatusCode, String)> {
    if !*state.worker_ready.read().unwrap() {
        return Err((StatusCode::SERVICE_UNAVAILABLE, "Worker not ready".into()));
    }

    let mut image_b64: Option<String> = None;
    let mut quality = "balanced".to_string();
    let mut style = "photo".to_string();
    let mut seed: i64 = 42;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "image" => {
                let data = field
                    .bytes()
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
                image_b64 = Some(B64.encode(&data));
            }
            "quality" => quality = field.text().await.unwrap_or_default(),
            "style" => style = field.text().await.unwrap_or_default(),
            "seed" => seed = field.text().await.unwrap_or_default().parse().unwrap_or(42),
            _ => {}
        }
    }

    let b64 = image_b64.ok_or((StatusCode::BAD_REQUEST, "Missing 'image' field".into()))?;
    let payload = json!({ "image_b64": b64, "quality": quality, "style": style, "seed": seed });

    let resp = call_worker("/infer", payload).await?;
    let glb_path = extract_glb_path(&resp)?;
    let url = stage_glb(&state, &glb_path).await?;
    Ok(Json(json!({ "url": url })))
}

// ── /generate-3d-multi ────────────────────────────────────────────────────────

async fn generate_3d_multi(
    State(state): State<SharedState>,
    mut multipart: Multipart,
) -> Result<Json<Value>, (StatusCode, String)> {
    if !*state.worker_ready.read().unwrap() {
        return Err((StatusCode::SERVICE_UNAVAILABLE, "Worker not ready".into()));
    }

    let mut images_b64: Vec<String> = Vec::new();
    let mut quality = "balanced".to_string();
    let mut style = "photo".to_string();
    let mut mode = "multidiffusion".to_string();
    let mut seed: i64 = 42;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "images" => {
                let data = field
                    .bytes()
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
                images_b64.push(B64.encode(&data));
            }
            "quality" => quality = field.text().await.unwrap_or_default(),
            "style" => style = field.text().await.unwrap_or_default(),
            "mode" => mode = field.text().await.unwrap_or_default(),
            "seed" => seed = field.text().await.unwrap_or_default().parse().unwrap_or(42),
            _ => {}
        }
    }

    if images_b64.len() < 2 || images_b64.len() > 4 {
        return Err((StatusCode::BAD_REQUEST, "Provide 2–4 images".into()));
    }

    let payload = json!({
        "images_b64": images_b64,
        "quality": quality,
        "style": style,
        "mode": mode,
        "seed": seed,
    });

    let resp = call_worker("/infer-multi", payload).await?;
    let glb_path = extract_glb_path(&resp)?;
    let url = stage_glb(&state, &glb_path).await?;
    Ok(Json(json!({ "url": url })))
}

// ── helpers ───────────────────────────────────────────────────────────────────

async fn call_worker(path: &str, payload: Value) -> Result<Value, (StatusCode, String)> {
    let url = format!("http://127.0.0.1:8001{path}");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(600))
        .build()
        .unwrap();

    let resp = client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;

    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err((StatusCode::BAD_GATEWAY, text));
    }

    resp.json::<Value>()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))
}

fn extract_glb_path(resp: &Value) -> Result<PathBuf, (StatusCode, String)> {
    Ok(resp["glb_path"]
        .as_str()
        .ok_or((StatusCode::INTERNAL_SERVER_ERROR, "No glb_path in worker response".into()))?
        .into())
}

/// Copy the GLB produced by the Python worker into our managed output_dir.
/// Returns the public URL (`/files/<uuid>.glb`).
async fn stage_glb(state: &AppState, src: &PathBuf) -> Result<String, (StatusCode, String)> {
    let name = format!("{}.glb", Uuid::new_v4());
    let dst = state.output_dir.join(&name);
    tokio::fs::copy(src, &dst).await.map_err(|e| {
        error!("Failed to copy GLB from {} to {}: {e}", src.display(), dst.display());
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;
    Ok(format!("/files/{name}"))
}
