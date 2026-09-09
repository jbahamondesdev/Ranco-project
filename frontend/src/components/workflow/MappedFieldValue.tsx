import type { MappedField } from "../../api/types";

function parseRows(value: string | null): Record<string, unknown>[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Muestra el valor de un campo mapeado: texto plano, o una mini-tabla si es de tipo "tabla". */
export function MappedFieldValue({ field }: { field: Pick<MappedField, "data_type" | "value"> }) {
  if (field.data_type !== "tabla") {
    return <>{field.value ?? "—"}</>;
  }

  const rows = parseRows(field.value);
  if (rows.length === 0) {
    return <span style={{ color: "var(--text-muted)" }}>Sin filas detectadas</span>;
  }
  const columns = Object.keys(rows[0]);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ fontSize: 12 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c}>{row[c] === null || row[c] === undefined ? "—" : String(row[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
