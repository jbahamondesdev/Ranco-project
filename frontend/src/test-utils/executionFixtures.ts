import type { ExecutionDetail, ExecutionEvent, MappedField } from "../api/types";

export function makeMappedField(overrides: Partial<MappedField> = {}): MappedField {
  return {
    id: "f1",
    field_name: "campo",
    data_type: "texto",
    value: "valor",
    confidence: 0.9,
    status: "ok",
    reason: null,
    corrected_value: null,
    corrected_by_role: null,
    corrected_at: null,
    resolved: false,
    ...overrides,
  };
}

export function makeEvent(overrides: Partial<ExecutionEvent> = {}): ExecutionEvent {
  return {
    id: "ev1",
    stage: "extraction",
    status: "ok",
    message: null,
    timestamp: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function makeExecution(overrides: Partial<ExecutionDetail> = {}): ExecutionDetail {
  return {
    id: "e1",
    document_id: "d1",
    document_type_version_id: "v1",
    workflow_id: null,
    status: "completed",
    seen: false,
    has_unresolved_issues: false,
    confidence_threshold_used: 0.8,
    started_at: "2026-01-01T00:00:00Z",
    completed_at: "2026-01-01T00:01:00Z",
    error_message: null,
    events: [],
    mapped_fields: [],
    document_filename: "doc.pdf",
    document_type_name: "Factura",
    document_type_version_number: 1,
    fields_schema: [],
    extraction_preview: null,
    model_response_json: null,
    ...overrides,
  };
}
