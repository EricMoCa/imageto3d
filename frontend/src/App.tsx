import { useState } from "react";
import { useGenerate3D } from "./hooks/useGenerate3D";
import { DropZone } from "./components/DropZone";
import { MultiDropZone } from "./components/MultiDropZone";
import { StatusBar } from "./components/StatusBar";
import { Viewer3D } from "./components/Viewer3D";
import { DownloadButton } from "./components/DownloadButton";
import type { AppMode, Quality, Style } from "./types";

export function App() {
  const { status, glbUrl, error, generate, generateMulti, reset } = useGenerate3D();
  const [mode, setMode] = useState<AppMode>("single");

  function handleModeChange(m: AppMode) {
    setMode(m);
    reset();
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#030712",
      color: "#f9fafb",
      fontFamily: "'Inter', system-ui, sans-serif",
      display: "flex",
      flexDirection: "column",
    }}>
      <header style={{
        padding: "20px 32px",
        borderBottom: "1px solid #1f2937",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        <span style={{ fontSize: 24 }}>🧊</span>
        <span style={{ fontSize: 20, fontWeight: 700 }}>Image to 3D</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>
          Powered by TRELLIS
        </span>
      </header>

      <main style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "400px 1fr",
        gap: 24,
        padding: 32,
        maxWidth: 1200,
        width: "100%",
        margin: "0 auto",
        boxSizing: "border-box",
      }}>
        {/* Left panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#e5e7eb" }}>
              Entrada
            </h2>

            {/* Mode toggle */}
            <div style={{ display: "flex", gap: 4, background: "#111827", borderRadius: 8, padding: 3 }}>
              {(["single", "multi"] as AppMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => handleModeChange(m)}
                  style={{
                    padding: "5px 12px",
                    fontSize: 12,
                    fontWeight: mode === m ? 600 : 400,
                    background: mode === m ? "#1f2937" : "transparent",
                    color: mode === m ? "#e9d5ff" : "#6b7280",
                    border: mode === m ? "1px solid #374151" : "1px solid transparent",
                    borderRadius: 6,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {m === "single" ? "1 imagen" : "Multi-vista"}
                </button>
              ))}
            </div>
          </div>

          {mode === "single" ? (
            <DropZone
              status={status}
              onGenerate={(file: File, quality: Quality, style: Style) =>
                generate(file, quality, style)
              }
              onReset={reset}
            />
          ) : (
            <MultiDropZone
              status={status}
              onGenerate={(files: File[], quality: Quality, style: Style) =>
                generateMulti(files, quality, style)
              }
              onReset={reset}
            />
          )}

          <StatusBar status={status} error={error} />
        </div>

        {/* Right panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#e5e7eb" }}>
              Modelo 3D
            </h2>
            {glbUrl && <DownloadButton url={glbUrl} />}
          </div>

          {glbUrl ? (
            <Viewer3D url={glbUrl} />
          ) : (
            <div style={{
              flex: 1,
              minHeight: 420,
              borderRadius: 12,
              border: "1px dashed #374151",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#4b5563",
              fontSize: 14,
            }}>
              {status === "processing" ? "Procesando..." : "El modelo aparecerá aquí"}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
