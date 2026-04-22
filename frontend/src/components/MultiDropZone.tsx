import { useRef, useState, DragEvent, ChangeEvent } from "react";
import type { GenerateStatus, Quality, Style } from "../types";

interface Props {
  status: GenerateStatus;
  onGenerate: (files: File[], quality: Quality, style: Style) => void;
  onReset: () => void;
}

const ACCEPT = ["image/png", "image/jpeg", "image/webp"];
const SLOT_LABELS = ["Vista frontal", "Vista lateral", "Vista trasera", "Vista superior"];

const QUALITY_OPTIONS: { value: Quality; label: string; time: string }[] = [
  { value: "fast",     label: "Rápido",     time: "~2 min" },
  { value: "balanced", label: "Balanceado", time: "~4 min" },
  { value: "quality",  label: "Calidad",    time: "~6 min" },
];

const STYLE_OPTIONS: { value: Style; label: string; emoji: string }[] = [
  { value: "photo", label: "Foto",  emoji: "📷" },
  { value: "anime", label: "Anime", emoji: "🎌" },
  { value: "art",   label: "Arte",  emoji: "🎨" },
];

export function MultiDropZone({ status, onGenerate, onReset }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [slots, setSlots] = useState<(File | null)[]>([null, null, null, null]);
  const [previews, setPreviews] = useState<(string | null)[]>([null, null, null, null]);
  const [quality, setQuality] = useState<Quality>("balanced");
  const [style, setStyle] = useState<Style>("photo");

  const busy = status === "uploading" || status === "processing";
  const filledSlots = slots.filter(Boolean) as File[];
  const canGenerate = filledSlots.length >= 2 && !busy;

  function assignFile(slotIdx: number, f: File) {
    if (!ACCEPT.includes(f.type)) return;
    setSlots((prev) => { const n = [...prev]; n[slotIdx] = f; return n; });
    setPreviews((prev) => { const n = [...prev]; n[slotIdx] = URL.createObjectURL(f); return n; });
  }

  function clearSlot(slotIdx: number) {
    setSlots((prev) => { const n = [...prev]; n[slotIdx] = null; return n; });
    setPreviews((prev) => { const n = [...prev]; n[slotIdx] = null; return n; });
  }

  function onSlotClick(idx: number) {
    if (busy) return;
    setActiveSlot(idx);
    inputRef.current?.click();
  }

  function onDrop(e: DragEvent, idx: number) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) assignFile(idx, f);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f && activeSlot !== null) assignFile(activeSlot, f);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleReset() {
    setSlots([null, null, null, null]);
    setPreviews([null, null, null, null]);
    onReset();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Info */}
      <p style={{ margin: 0, fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>
        Sube <strong style={{ color: "#9ca3af" }}>2–4 vistas</strong> del mismo objeto desde ángulos distintos.
        TRELLIS las combina para generar una malla más coherente.
      </p>

      {/* Slots grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {slots.map((_, idx) => (
          <div key={idx} style={{ position: "relative" }}>
            <div
              onClick={() => onSlotClick(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, idx)}
              style={{
                border: `2px dashed ${previews[idx] ? "#7c3aed" : "#374151"}`,
                borderRadius: 10,
                minHeight: 110,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                cursor: busy ? "not-allowed" : "pointer",
                background: previews[idx] ? "#0f0a1e" : "#111827",
                transition: "border-color 0.15s, background 0.15s",
                overflow: "hidden",
                padding: previews[idx] ? 0 : 10,
              }}
            >
              {previews[idx] ? (
                <img
                  src={previews[idx]!}
                  alt={SLOT_LABELS[idx]}
                  style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }}
                />
              ) : (
                <span style={{ fontSize: 12, color: "#4b5563", textAlign: "center" }}>
                  {idx < 2 ? "⬆ " : ""}{SLOT_LABELS[idx]}
                  <br />
                  <span style={{ fontSize: 10 }}>clic o arrastra</span>
                </span>
              )}
            </div>

            {/* Clear button */}
            {previews[idx] && !busy && (
              <button
                onClick={(e) => { e.stopPropagation(); clearSlot(idx); }}
                style={{
                  position: "absolute", top: 4, right: 4,
                  background: "#111827cc", border: "none",
                  color: "#9ca3af", borderRadius: "50%",
                  width: 20, height: 20, cursor: "pointer",
                  fontSize: 12, lineHeight: "20px", textAlign: "center",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <input ref={inputRef} type="file" accept={ACCEPT.join(",")}
        onChange={onChange} style={{ display: "none" }} />

      <p style={{ margin: 0, fontSize: 11, color: "#4b5563" }}>
        {filledSlots.length === 0
          ? "Mínimo 2 imágenes para generar"
          : `${filledSlots.length} imagen${filledSlots.length > 1 ? "es" : ""} lista${filledSlots.length > 1 ? "s" : ""} — ${filledSlots.length < 2 ? "añade 1 más para continuar" : "listo para generar"}`}
      </p>

      {/* Style selector */}
      <div>
        <label style={labelStyle}>Estilo de imagen</label>
        <div style={{ display: "flex", gap: 6 }}>
          {STYLE_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => setStyle(opt.value)}
              disabled={busy} style={chipStyle(style === opt.value, busy)}>
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
            <button key={opt.value} onClick={() => setQuality(opt.value)}
              disabled={busy} style={chipStyle(quality === opt.value, busy)}>
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
          disabled={!canGenerate}
          onClick={() => onGenerate(filledSlots, quality, style)}
          style={actionButtonStyle(!canGenerate, "#7c3aed")}
        >
          {busy ? "Generando..." : `✨ Generar 3D (${filledSlots.length} vistas)`}
        </button>
        {(filledSlots.length > 0 || status !== "idle") && (
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
  display: "block", fontSize: 11, fontWeight: 600,
  color: "#6b7280", textTransform: "uppercase",
  letterSpacing: "0.05em", marginBottom: 6,
};

function chipStyle(active: boolean, disabled: boolean): React.CSSProperties {
  return {
    flex: 1, padding: "7px 10px",
    background: active ? "#3b0764" : "#1f2937",
    color: active ? "#e9d5ff" : disabled ? "#4b5563" : "#9ca3af",
    border: `1px solid ${active ? "#7c3aed" : "#374151"}`,
    borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 13, fontWeight: active ? 600 : 400, transition: "all 0.15s",
  };
}

function actionButtonStyle(disabled: boolean, bg: string): React.CSSProperties {
  return {
    flex: 1, padding: "10px 20px",
    background: disabled ? "#1f2937" : bg,
    color: disabled ? "#6b7280" : "#fff",
    border: "none", borderRadius: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 14, fontWeight: 600, transition: "background 0.2s",
  };
}
