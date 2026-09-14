import type { FieldDefinition, WorkflowFieldThreshold } from "../../../api/types";
import { DATA_TYPE_ICON } from "../../../utils/dataType";
import { fieldControlStyle } from "./styles";

// --- 3. Validaciones ---
export interface ValidationNodeData {
  hasDocumentType: boolean;
  fields: FieldDefinition[];
  thresholds: Record<string, WorkflowFieldThreshold>;
  onToggleField: (key: string, enabled: boolean) => void;
  onChange: (key: string, patch: Partial<WorkflowFieldThreshold>) => void;
}

function FieldThresholdRow({
  field,
  thresholdKey,
  thresholds,
  onToggleField,
  onChange,
  nested = false,
}: {
  field: FieldDefinition;
  thresholdKey: string;
  thresholds: Record<string, WorkflowFieldThreshold>;
  onToggleField: (key: string, enabled: boolean) => void;
  onChange: (key: string, patch: Partial<WorkflowFieldThreshold>) => void;
  nested?: boolean;
}) {
  const Icon = DATA_TYPE_ICON[field.data_type];
  const isTable = field.data_type === "tabla";
  const checked = !isTable && thresholdKey in thresholds;
  const threshold = thresholds[thresholdKey] ?? { min: null, max: null };

  return (
    <div style={{ padding: "6px 0", borderBottom: nested ? "none" : "1px solid var(--border)" }}>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11.5,
          cursor: isTable ? "default" : "pointer",
        }}
      >
        {!isTable && (
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onToggleField(thresholdKey, e.target.checked)}
          />
        )}
        <Icon size={12} color="var(--text-muted)" />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{field.name}</span>
      </label>

      {checked && (
        <div style={{ display: "flex", gap: 6, marginTop: 5, marginLeft: 18 }}>
          <input
            type="number"
            placeholder="Mín"
            value={threshold.min ?? ""}
            onChange={(e) => onChange(thresholdKey, { min: e.target.value || null })}
            style={{ ...fieldControlStyle, padding: "4px 6px", fontSize: 11.5 }}
          />
          <input
            type="number"
            placeholder="Máx"
            value={threshold.max ?? ""}
            onChange={(e) => onChange(thresholdKey, { max: e.target.value || null })}
            style={{ ...fieldControlStyle, padding: "4px 6px", fontSize: 11.5 }}
          />
        </div>
      )}

      {isTable && field.columns && field.columns.length > 0 && (
        <div style={{ marginTop: 4, marginLeft: 15, borderLeft: "2px solid var(--border)", paddingLeft: 8 }}>
          {field.columns.map((col) => (
            <FieldThresholdRow
              key={col.name}
              field={col}
              thresholdKey={`${thresholdKey}.${col.name}`}
              thresholds={thresholds}
              onToggleField={onToggleField}
              onChange={onChange}
              nested
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ValidationNode({ data }: { data: ValidationNodeData }) {
  return data.fields.length === 0 ? (
    <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>
      {data.hasDocumentType
        ? "Este tipo de documento no tiene campos numéricos para definir umbrales."
        : "Selecciona un tipo de documento en el paso 2 para configurar qué campos validar."}
    </p>
  ) : (
    <div>
      {data.fields.map((f) => (
        <FieldThresholdRow
          key={f.name}
          field={f}
          thresholdKey={f.name}
          thresholds={data.thresholds}
          onToggleField={data.onToggleField}
          onChange={data.onChange}
        />
      ))}
    </div>
  );
}
