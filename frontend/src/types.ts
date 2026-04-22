export type GenerateStatus = "idle" | "uploading" | "processing" | "done" | "error";
export type Quality = "fast" | "balanced" | "quality";
export type Style = "photo" | "anime" | "art";
export type AppMode = "single" | "multi";

export interface GenerateState {
  status: GenerateStatus;
  glbUrl: string | null;
  error: string | null;
}
