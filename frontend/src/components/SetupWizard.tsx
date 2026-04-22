/**
 * SetupWizard — shown on first run while Tauri downloads Python + model.
 * Listens to Server-Sent Events from GET /setup-events.
 */
import { useEffect, useRef, useState } from "react";

type StepKey = "python" | "deps" | "model" | "done";

interface Step {
  key: StepKey;
  label: string;
  icon: string;
}

const STEPS: Step[] = [
  { key: "python", label: "Instalando Python 3.10", icon: "🐍" },
  { key: "deps",   label: "Instalando dependencias", icon: "📦" },
  { key: "model",  label: "Descargando modelo TRELLIS", icon: "🤖" },
  { key: "done",   label: "¡Listo!", icon: "✅" },
];

type StepStatus = "pending" | "active" | "done" | "error";

interface StepState {
  status: StepStatus;
  progress?: number; // 0-100
  detail?: string;
}

type WizardState = Record<StepKey, StepState>;

const initialState: WizardState = {
  python: { status: "pending" },
  deps:   { status: "pending" },
  model:  { status: "pending" },
  done:   { status: "pending" },
};

interface Props {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: Props) {
  const [steps, setSteps] = useState<WizardState>(initialState);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  const addLog = (line: string) =>
    setLogs((prev) => [...prev.slice(-300), line]);

  const setStep = (key: StepKey, patch: Partial<StepState>) =>
    setSteps((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));

  useEffect(() => {
    const es = new EventSource("/setup-events");
    esRef.current = es;

    es.onmessage = (ev) => {
      const data: string = ev.data;
      addLog(data);

      // ── Python step ──────────────────────────────────────────────────────
      if (data.startsWith("PYTHON_START")) {
        setStep("python", { status: "active" });
      } else if (data === "PYTHON_DONE") {
        setStep("python", { status: "done" });
      } else if (data.startsWith("PYTHON_ERROR")) {
        setStep("python", { status: "error", detail: data });
        setError(data);

      // ── Deps step ────────────────────────────────────────────────────────
      } else if (data.startsWith("DEPS_START")) {
        setStep("deps", { status: "active" });
      } else if (data === "DEPS_DONE") {
        setStep("deps", { status: "done" });
      } else if (data.startsWith("DEPS_ERROR")) {
        setStep("deps", { status: "error", detail: data });
        setError(data);

      // ── Model download ───────────────────────────────────────────────────
      } else if (data.startsWith("DOWNLOAD_START")) {
        setStep("model", { status: "active", progress: 0 });
      } else if (data.startsWith("DOWNLOAD_PROGRESS:")) {
        const pct = parseFloat(data.split(":")[1]);
        if (!isNaN(pct)) setStep("model", { status: "active", progress: pct });
      } else if (data === "DOWNLOAD_COMPLETE") {
        setStep("model", { status: "done", progress: 100 });
      } else if (data.startsWith("DOWNLOAD_ERROR")) {
        setStep("model", { status: "error", detail: data });
        setError(data);

      // ── All done ─────────────────────────────────────────────────────────
      } else if (data === "SETUP_COMPLETE" || data === "WORKER_READY") {
        setStep("done", { status: "done" });
        es.close();
        setTimeout(onComplete, 1200);
      }
    };

    es.onerror = () => {
      // SSE reconnects automatically; if already closed, ignore
    };

    return () => {
      es.close();
    };
  }, [onComplete]);

  // Auto-scroll log pane
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const activeStep = STEPS.find(
    (s) => steps[s.key].status === "active"
  );

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {/* Title */}
        <h1 style={styles.title}>Imageto3D</h1>
        <p style={styles.subtitle}>Primera ejecución — configurando entorno</p>

        {/* Steps */}
        <div style={styles.stepList}>
          {STEPS.map((s) => {
            const st = steps[s.key];
            return (
              <div key={s.key} style={styles.stepRow}>
                <span style={styles.stepIcon}>{stepIcon(st.status)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ ...styles.stepLabel, color: labelColor(st.status) }}>
                    {s.label}
                    {st.status === "active" && st.progress !== undefined && (
                      <span style={styles.pct}> {st.progress.toFixed(0)}%</span>
                    )}
                  </div>
                  {st.status === "active" && (
                    <div style={styles.progressBar}>
                      <div
                        style={{
                          ...styles.progressFill,
                          width: `${st.progress ?? 0}%`,
                          transition: st.progress !== undefined ? "width 0.4s" : "none",
                          animation: st.progress === undefined ? "pulse 1.2s infinite" : "none",
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Error banner */}
        {error && (
          <div style={styles.errorBanner}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Log pane */}
        <div ref={logRef} style={styles.logPane}>
          {logs.map((line, i) => (
            <div key={i} style={styles.logLine}>{line}</div>
          ))}
          {logs.length === 0 && (
            <div style={{ color: "#4b5563" }}>Iniciando setup…</div>
          )}
        </div>

        {/* Footer hint */}
        <p style={styles.hint}>
          {activeStep
            ? `${activeStep.icon} ${activeStep.label}…`
            : error
            ? "Revisa los logs y reinicia la aplicación."
            : "Preparando todo, esto puede tardar unos minutos."}
        </p>
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function stepIcon(status: StepStatus): string {
  switch (status) {
    case "done":    return "✅";
    case "error":   return "❌";
    case "active":  return "⏳";
    default:        return "⬜";
  }
}

function labelColor(status: StepStatus): string {
  switch (status) {
    case "done":   return "#34d399";
    case "error":  return "#f87171";
    case "active": return "#f9fafb";
    default:       return "#6b7280";
  }
}

// ── inline styles ─────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "#0f172a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  card: {
    background: "#1e293b",
    borderRadius: 16,
    padding: "2rem 2.5rem",
    width: "min(520px, 92vw)",
    boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  },
  title: {
    margin: 0,
    fontSize: "1.8rem",
    fontWeight: 700,
    color: "#f9fafb",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    margin: 0,
    color: "#94a3b8",
    fontSize: "0.9rem",
  },
  stepList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.8rem",
  },
  stepRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.75rem",
  },
  stepIcon: {
    fontSize: "1.1rem",
    lineHeight: "1.4rem",
    width: "1.4rem",
    textAlign: "center",
    flexShrink: 0,
  },
  stepLabel: {
    fontSize: "0.95rem",
    fontWeight: 500,
    lineHeight: "1.4rem",
  },
  pct: {
    fontSize: "0.8rem",
    color: "#60a5fa",
    fontWeight: 400,
  },
  progressBar: {
    marginTop: 4,
    height: 4,
    background: "#334155",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, #3b82f6, #8b5cf6)",
    borderRadius: 2,
  },
  errorBanner: {
    background: "#450a0a",
    border: "1px solid #7f1d1d",
    color: "#fca5a5",
    borderRadius: 8,
    padding: "0.6rem 0.9rem",
    fontSize: "0.85rem",
  },
  logPane: {
    background: "#0f172a",
    borderRadius: 8,
    padding: "0.75rem",
    height: 140,
    overflowY: "auto",
    fontFamily: "monospace",
    fontSize: "0.72rem",
    color: "#94a3b8",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  logLine: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  },
  hint: {
    margin: 0,
    color: "#64748b",
    fontSize: "0.8rem",
    textAlign: "center",
  },
};
