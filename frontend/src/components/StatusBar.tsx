import type { GenerateStatus } from "../types";

interface Props {
  status: GenerateStatus;
  error: string | null;
}

const MESSAGES: Record<GenerateStatus, string> = {
  idle: "Sube una imagen para comenzar",
  uploading: "Subiendo imagen...",
  processing: "Generando modelo 3D... (puede tardar 1–2 min)",
  done: "¡Modelo generado con éxito!",
  error: "Ocurrió un error",
};

const ICONS: Record<GenerateStatus, string> = {
  idle: "🖼️",
  uploading: "⬆️",
  processing: "⚙️",
  done: "✅",
  error: "❌",
};

const COLORS: Record<GenerateStatus, string> = {
  idle: "#6b7280",
  uploading: "#3b82f6",
  processing: "#f59e0b",
  done: "#10b981",
  error: "#ef4444",
};

export function StatusBar({ status, error }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 16px",
        borderRadius: 8,
        background: "#1f2937",
        border: `1px solid ${COLORS[status]}33`,
        color: COLORS[status],
        fontSize: 14,
      }}
    >
      <span style={{ fontSize: 18 }}>
        {status === "processing" ? <Spinner /> : ICONS[status]}
      </span>
      <span style={{ fontWeight: 500 }}>
        {status === "error" && error ? error : MESSAGES[status]}
      </span>
    </div>
  );
}

function Spinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 18,
        height: 18,
        border: "2px solid #f59e0b44",
        borderTop: "2px solid #f59e0b",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }}
    />
  );
}
