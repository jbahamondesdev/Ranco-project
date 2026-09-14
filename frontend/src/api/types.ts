export type DataType = "texto" | "numero" | "fecha" | "booleano" | "tabla" | "porcentaje";

export interface ValidationRule {
  type: "obligatorio" | "min" | "max";
  value: string | null;
}

export interface FieldDefinition {
  name: string;
  data_type: DataType;
  required: boolean;
  validation_rules: ValidationRule[];
  // instruccion puntual de donde/como extraer este campo cuando el nombre y tipo de
  // dato no bastan (ej. "tomar el total fuera de la tabla, no el subtotal de una
  // fila") - viaja al LLM como parte del JSON Schema de extraccion, ver
  // backend/app/pipeline/json_schema.py
  description?: string | null;
  columns?: FieldDefinition[] | null;
}

export type PrimitiveValue = string | number | boolean;

export interface SuggestedColumn {
  name: string;
  data_type: DataType;
  description?: string | null;
}

export interface SuggestedField {
  name: string;
  data_type: DataType;
  required: boolean;
  sample_value?: PrimitiveValue | null;
  description?: string | null;
  columns?: SuggestedColumn[] | null;
  sample_rows?: Record<string, PrimitiveValue | null>[] | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface DocumentChatResponse {
  reply: string;
  fields: SuggestedField[];
}

export interface MappedFieldPreview {
  field_name: string;
  data_type: DataType;
  value: string | null;
  confidence: number | null;
  status: "ok" | "needs_review" | "missing" | "warning";
  reason: string | null;
}

export interface PreviewExtractionResponse {
  fields: MappedFieldPreview[];
}

export interface DocumentType {
  id: string;
  name: string;
  status: "draft" | "published";
  created_at: string;
}

export interface DocumentTypeVersion {
  id: string;
  document_type_id: string;
  version_number: number;
  fields_schema: FieldDefinition[];
  reference_document_id: string | null;
  extraction_schema: Record<string, unknown> | null;
  status: "draft" | "published";
  created_at: string;
  published_at: string | null;
}

export interface DocumentTypeDetail extends DocumentType {
  versions: DocumentTypeVersion[];
}

export interface DocumentItem {
  id: string;
  original_filename: string;
  document_type_id: string | null;
  uploaded_at: string;
  uploaded_by_role: string;
}

export type ExecutionStatus =
  | "pending"
  | "extracting"
  | "mapping"
  | "validating"
  | "needs_review"
  | "completed"
  | "error";

export interface ExecutionEvent {
  id: string;
  stage: string;
  status: string;
  message: string | null;
  timestamp: string;
}

export interface MappedField {
  id: string;
  field_name: string;
  data_type: DataType;
  value: string | null;
  confidence: number | null;
  status: "ok" | "needs_review" | "missing" | "warning";
  reason: string | null;
  corrected_value: string | null;
  corrected_by_role: string | null;
  corrected_at: string | null;
  resolved: boolean;
}

export interface Execution {
  id: string;
  document_id: string;
  document_type_version_id: string;
  workflow_id: string | null;
  status: ExecutionStatus;
  seen: boolean;
  has_unresolved_issues: boolean;
  confidence_threshold_used: number | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export interface ExtractionPreview {
  content_preview: string;
  content_length: number;
  table_count: number;
  page_count: number;
}

export interface ExecutionDetail extends Execution {
  events: ExecutionEvent[];
  mapped_fields: MappedField[];
  document_filename: string;
  document_type_name: string;
  document_type_version_number: number;
  fields_schema: FieldDefinition[];
  extraction_preview: ExtractionPreview | null;
  model_response_json: string | null;
}

export type Role = "admin" | "operador" | "revisor";

export interface DocumentTypeStats {
  document_type_id: string;
  document_type_name: string;
  total: number;
  needs_review: number;
  avg_confidence: number | null;
}

export interface ExecutionStats {
  total: number;
  by_status: Record<string, number>;
  avg_confidence: number | null;
  avg_duration_seconds: number | null;
  by_document_type: DocumentTypeStats[];
}

export type WorkflowStatus = "active" | "paused";
export type WorkflowDestination = "internal_db" | "webhook";
export type WorkflowTriggerType = "manual" | "repository_polling";

export interface WorkflowFieldThreshold {
  min: string | null;
  max: string | null;
}

export interface WorkflowDestinationConfig {
  url?: string;
}

export interface Workflow {
  id: string;
  name: string;
  status: WorkflowStatus;
  trigger_type: WorkflowTriggerType;
  document_type_id: string | null;
  destination: WorkflowDestination;
  destination_config: WorkflowDestinationConfig | null;
  field_thresholds: Record<string, WorkflowFieldThreshold>;
  created_at: string;
  updated_at: string;
}
