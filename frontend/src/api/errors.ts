export function extractErrorMessage(err: unknown, fallback = "Ocurrió un error inesperado."): string {
  if (err instanceof Error) {
    const match = err.message.match(/:\s*(\{.*\})\s*$/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (typeof parsed.detail === "string") return parsed.detail;
      } catch {
        /* el cuerpo no era JSON, se usa el mensaje crudo */
      }
    }
    return err.message;
  }
  return fallback;
}
