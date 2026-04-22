interface Props {
  url: string;
}

export function DownloadButton({ url }: Props) {
  const parts = url.split("/");
  const filename = parts[parts.length - 1] ?? "model.glb";

  return (
    <a
      href={url}
      download={filename}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 20px",
        background: "#059669",
        color: "#fff",
        borderRadius: 8,
        textDecoration: "none",
        fontWeight: 600,
        fontSize: 14,
        transition: "background 0.2s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#047857")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "#059669")}
    >
      ⬇️ Descargar .glb
    </a>
  );
}
