/*!
Background task that deletes GLB files older than OUTPUT_TTL_SECONDS from output_dir.
Runs every CLEANUP_INTERVAL_SECS seconds.
*/

use std::{path::PathBuf, time::SystemTime};
use tokio::time::{sleep, Duration};
use tracing::{info, warn};

const CLEANUP_INTERVAL_SECS: u64 = 300; // 5 minutes
const OUTPUT_TTL_SECS: u64 = 3600;      // 1 hour

/// Spawn a background cleanup task. Never returns.
pub async fn run(output_dir: PathBuf) {
    loop {
        sleep(Duration::from_secs(CLEANUP_INTERVAL_SECS)).await;
        cleanup_once(&output_dir).await;
    }
}

async fn cleanup_once(output_dir: &PathBuf) {
    let now = SystemTime::now();
    let mut removed = 0usize;

    let read_dir = match tokio::fs::read_dir(output_dir).await {
        Ok(d) => d,
        Err(e) => {
            warn!("cleanup: cannot read output_dir: {e}");
            return;
        }
    };

    let mut entries = read_dir;
    loop {
        match entries.next_entry().await {
            Ok(Some(entry)) => {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) != Some("glb") {
                    continue;
                }
                if let Ok(meta) = tokio::fs::metadata(&path).await {
                    if let Ok(modified) = meta.modified() {
                        let age = now.duration_since(modified).unwrap_or_default();
                        if age.as_secs() > OUTPUT_TTL_SECS {
                            if tokio::fs::remove_file(&path).await.is_ok() {
                                removed += 1;
                            }
                        }
                    }
                }
            }
            Ok(None) => break,
            Err(e) => {
                warn!("cleanup: read_dir entry error: {e}");
                break;
            }
        }
    }

    if removed > 0 {
        info!("cleanup: removed {removed} expired GLB file(s)");
    }
}
