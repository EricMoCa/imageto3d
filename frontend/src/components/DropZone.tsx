import { useRef, useState, DragEvent, ChangeEvent } from "react";
import type { GenerateStatus, Quality, Style } from "../types";

interface Props {
  status: GenerateStatus;
  onGenerate: (file: File, quality: Quality, style: Style) => void;
  onReset: () => void;
}

const ACCEPT = ["image/png", "image/jpeg", "image/webp"];

const QUALITY_OPTIONS: { value: Quality; label: string; time: string }[] = [
  { value: "fast",     label: "Rápido",     time: "~1 min" },
  { value: "balanced", label: "Balanceado", time: "~2 min" },
  { value: "quality",  label: "Calidad",    time: "~4 min" },
];

const STYLE_OPTIONS: { value: Style; label: string; emoji: string }[] = [
  { value: "photo", label: "Foto",  emoji: "📷" },
  { value: "anime", label: "Anime", emoji: "🎌" },
  { value: "art",   label: "Arte",  emoji: "🎨" },
];

export function DropZone({ status, onGenerate, onReset }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [quality, setQuality] = useState<Quality>("balanced");
  const [style, setStyle] = useState<Style>("photo");

  function handleFile(f: File) {
    if (!ACCEPT.includes(f.type)) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }

  function handleReset() {
    setFile(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
    onReset();
  }

  const busy = status === "uploading" || status === "processing";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Drop area */}
      <div
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${dragging ? "#7c3aed" : "#4b5563"}`,
          borderRadius: 12,
          padding: 32,
          textAlign: "center",
          cursor: busy ? "not-allowed" : "pointer",
          background: dragging ? "#1e1b4b" : "#111827",
          transition: "border-color 0.2s, background 0.2s",
          minHeight: 160,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {preview ? (
          <img src={preview} alt="preview"
            style={{ maxHeight: 200, maxWidth: "100%", borderRadius: 8 }} />
        ) : (
          <span style={{ color: "#9ca3af", fontSize: 14 }}>
            Arrastra una imagen aquí o haz clic para seleccionar
            <br />
            <span style={{ fontSize: 12, color: "#6b7280" }}>PNG, JPG, WEBP</span>
          </span>
        )}
      </div>

      <input ref={inputRef} type="file" accept={ACCEPT.join(",")}
        onChange={onChange} style={{ display: "none" }} />

      {/* Style selector */}
      <div>
        <label style={labelStyle}>Estilo de imagen</label>
        <div style={{ display: "flex", gap: 6 }}>
          {STYLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStyle(opt.value)}
              disabled={busy}
              style={chipStyle(style === opt.value, busy)}
            >
              {opt.emoji} {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quality selector */}
      <div>
        <label style={labelStyle}>Calidad</label>
        <div style={{ display: "flex", gap: 6 }}>
          {QUALITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setQuality(opt.value)}
              disabled={busy}
              style={chipStyle(quality === opt.value, busy)}
            >
              {opt.label}
              <span style={{ fontSize: 10, color: quality === opt.value ? "#c4b5fd" : "#6b7280", marginLeft: 4 }}>
                {opt.time}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          disabled={!file || busy}
          onClick={() => { if (file) onGenerate(file, quality, style); }}
          style={actionButtonStyle(!file || busy, "#7c3aed")}
        >
          {busy ? "Generando..." : "✨ Generar 3D"}
        </button>

        {(preview || status !== "idle") && (
          <button onClick={handleReset} disabled={busy}
            style={actionButtonStyle(busy, "#374151")}>
            Reiniciar
          </button>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 6,
};

function chipStyle(active: boolean, disabled: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: "7px 10px",
    background: active ? "#3b0764" : "#1f2937",
    color: active ? "#e9d5ff" : disabled ? "#4b5563" : "#9ca3af",
    border: `1px solid ${active ? "#7c3aed" : "#374151"}`,
    borderRadius: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    transition: "all 0.15s",
  };
}

function actionButtonStyle(disabled: boolean, bg: string): React.CSSProperties {
  return {
    flex: 1,
    padding: "10px 20px",
    background: disabled ? "#1f2937" : bg,
    color: disabled ? "#6b7280" : "#fff",
    border: "none",
    borderRadius: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 14,
    fontWeight: 600,
    transition: "background 0.2s",
  };
}
