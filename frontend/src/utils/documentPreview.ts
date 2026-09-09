export type DocumentPreviewKind = "pdf" | "image" | "other";

export function guessPreviewKind(filename: string): DocumentPreviewKind {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext)) return "image";
  return "other";
}
