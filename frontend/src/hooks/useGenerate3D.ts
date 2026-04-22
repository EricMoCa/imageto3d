import { useState, useCallback } from "react";
import type { GenerateState, Quality, Style } from "../types";

export function useGenerate3D() {
  const [state, setState] = useState<GenerateState>({
    status: "idle",
    glbUrl: null,
    error: null,
  });

  /** Single-image generation */
  const generate = useCallback(
    async (file: File, quality: Quality = "balanced", style: Style = "photo") => {
      setState({ status: "uploading", glbUrl: null, error: null });

      const form = new FormData();
      form.append("image", file);
      form.append("quality", quality);
      form.append("style", style);

      try {
        setState((s) => ({ ...s, status: "processing" }));
        const res = await fetch("/generate-3d", { method: "POST", body: form });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ detail: res.statusText }));
          throw new Error(body.detail ?? "Unknown error");
        }
        const { url } = (await res.json()) as { url: string };
        setState({ status: "done", glbUrl: url, error: null });
      } catch (err) {
        setState({
          status: "error",
          glbUrl: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    []
  );

  /** Multi-image generation (2-4 views of the same object) */
  const generateMulti = useCallback(
    async (
      files: File[],
      quality: Quality = "balanced",
      style: Style = "photo",
    ) => {
      setState({ status: "uploading", glbUrl: null, error: null });

      const form = new FormData();
      files.forEach((f) => form.append("images", f));
      form.append("quality", quality);
      form.append("style", style);
      form.append("mode", "multidiffusion");

      try {
        setState((s) => ({ ...s, status: "processing" }));
        const res = await fetch("/generate-3d-multi", { method: "POST", body: form });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ detail: res.statusText }));
          throw new Error(body.detail ?? "Unknown error");
        }
        const { url } = (await res.json()) as { url: string };
        setState({ status: "done", glbUrl: url, error: null });
      } catch (err) {
        setState({
          status: "error",
          glbUrl: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    []
  );

  const reset = useCallback(() => {
    setState({ status: "idle", glbUrl: null, error: null });
  }, []);

  return { ...state, generate, generateMulti, reset };
}
