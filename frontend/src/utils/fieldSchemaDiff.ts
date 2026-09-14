import type { FieldDefinition } from "../api/types";

export interface FieldSchemaDiffEntry {
  name: string;
  kind: "added" | "removed" | "changed";
  changes?: string[];
}

// Compara el fields_schema de dos versiones de un tipo de documento (solo lectura,
// para mostrar que cambio entre una version y la anterior) - no toca el estado
// editable del formulario principal.
export function diffFieldSchemas(before: FieldDefinition[], after: FieldDefinition[]): FieldSchemaDiffEntry[] {
  const beforeByName = new Map(before.map((f) => [f.name, f]));
  const afterByName = new Map(after.map((f) => [f.name, f]));
  const entries: FieldSchemaDiffEntry[] = [];

  for (const f of after) {
    if (!beforeByName.has(f.name)) entries.push({ name: f.name, kind: "added" });
  }
  for (const f of before) {
    if (!afterByName.has(f.name)) entries.push({ name: f.name, kind: "removed" });
  }
  for (const f of after) {
    const prev = beforeByName.get(f.name);
    if (!prev) continue;
    const changes: string[] = [];
    if (prev.data_type !== f.data_type) changes.push(`tipo de dato: ${prev.data_type} → ${f.data_type}`);
    if (prev.required !== f.required) {
      changes.push(`obligatorio: ${prev.required ? "sí" : "no"} → ${f.required ? "sí" : "no"}`);
    }
    if (changes.length > 0) entries.push({ name: f.name, kind: "changed", changes });
  }

  return entries;
}
