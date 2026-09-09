// Persistencia (solo en este navegador) de dónde el usuario dejó cada nodo del
// canvas de un workflow. No es un dato del backend, es puramente una conveniencia
// visual — la usan tanto el editor como la vista de detalle de una ejecución (para
// que se vea igual a como el usuario armó el flujo).
const LAYOUT_PREFIX = "wf-node-layout:";

export function loadWorkflowLayout(key: string): Record<string, { x: number; y: number }> | null {
  try {
    const raw = localStorage.getItem(LAYOUT_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveWorkflowLayout(key: string, positions: Record<string, { x: number; y: number }>) {
  try {
    localStorage.setItem(LAYOUT_PREFIX + key, JSON.stringify(positions));
  } catch {
    /* localStorage lleno o deshabilitado: no es crítico, se ignora */
  }
}

export function clearWorkflowLayout(key: string) {
  try {
    localStorage.removeItem(LAYOUT_PREFIX + key);
  } catch {
    /* ignore */
  }
}
