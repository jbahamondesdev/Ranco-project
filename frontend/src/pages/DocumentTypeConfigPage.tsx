import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  Calendar,
  CheckCircle2,
  ExternalLink,
  FileText,
  Hash,
  Loader2,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Table2,
  ToggleLeft,
  Trash2,
  Type,
  UploadCloud,
  User,
} from "lucide-react";
import {
  useCreateDocumentType,
  useCreateVersion,
  useDocumentType,
  usePublishVersion,
  useUpdateDocumentType,
} from "../api/documentTypes";
import { useDocument, useUploadDocument, getDocumentFileUrl } from "../api/documents";
import { useDocumentChat } from "../api/chat";
import { Spinner } from "../components/common/Spinner";
import { guessPreviewKind } from "../utils/documentPreview";
import type {
  ChatMessage,
  DataType,
  FieldDefinition,
  PrimitiveValue,
  SuggestedField,
} from "../api/types";

const DATA_TYPE_LABEL: Record<DataType, string> = {
  texto: "texto",
  numero: "número",
  fecha: "fecha",
  booleano: "booleano",
  tabla: "tabla",
};

const DATA_TYPE_ICON: Record<DataType, typeof Type> = {
  texto: Type,
  numero: Hash,
  fecha: Calendar,
  booleano: ToggleLeft,
  tabla: Table2,
};

function formatValue(value: PrimitiveValue | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function toFieldDefinition(field: SuggestedField): FieldDefinition {
  return {
    name: field.name,
    data_type: field.data_type,
    required: field.required,
    validation_rules: field.required ? [{ type: "obligatorio", value: null }] : [],
    columns:
      field.data_type === "tabla" && field.columns
        ? field.columns.map((c) => ({
            name: c.name,
            data_type: c.data_type,
            required: false,
            validation_rules: [],
          }))
        : null,
  };
}

function toSuggestedField(field: FieldDefinition): SuggestedField {
  return {
    name: field.name,
    data_type: field.data_type,
    required: field.required,
    sample_value: null,
    columns: field.columns?.map((c) => ({ name: c.name, data_type: c.data_type })) ?? null,
    sample_rows: null,
  };
}

export function DocumentTypeConfigPage() {
  const { id } = useParams();
  const [documentTypeId, setDocumentTypeId] = useState<string | undefined>(id);
  const { data: docType } = useDocumentType(documentTypeId);
  const createDocumentType = useCreateDocumentType();
  const updateDocumentType = useUpdateDocumentType();
  const createVersion = useCreateVersion();
  const publishVersion = usePublishVersion();
  const uploadDocument = useUploadDocument();
  const chat = useDocumentChat();

  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(false);
  const [saved, setSaved] = useState(false);
  const prefilledRef = useRef(false);

  const [leftWidth, setLeftWidth] = useState(42); // porcentaje del panel izquierdo
  const [isDragging, setIsDragging] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);

  const [documentId, setDocumentId] = useState<string>();
  const { data: previewDoc } = useDocument(documentId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [fields, setFields] = useState<SuggestedField[]>([]);
  const [input, setInput] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!docType || prefilledRef.current) return;
    prefilledRef.current = true;
    setName(docType.name);
    const latestVersion = docType.versions[docType.versions.length - 1];
    if (latestVersion) {
      setFields(latestVersion.fields_schema.map(toSuggestedField));
      if (latestVersion.reference_document_id) {
        setDocumentId(latestVersion.reference_document_id);
      }
    }
  }, [docType]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [messages, chat.isPending]);

  const handleUpload = async (file: File) => {
    const doc = await uploadDocument.mutateAsync(file);
    setDocumentId(doc.id);
    setMessages([
      {
        role: "assistant",
        content:
          'Documento cargado. Contame qué campos quieres extraer (ej: "extrae el nombre del cliente y el monto total, y si hay una tabla de productos extráela también").',
      },
    ]);
    setSaved(false);
  };

  const handleSend = async () => {
    if (!documentId || !input.trim() || chat.isPending) return;
    const userMessage: ChatMessage = { role: "user", content: input.trim() };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");

    const res = await chat.mutateAsync({ documentId, messages: nextMessages, currentFields: fields });
    setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
    setFields(res.fields);
  };

  const updateField = (index: number, patch: Partial<SuggestedField>) => {
    setFields((fs) => fs.map((f, i) => (i === index ? { ...f, ...patch } : f)));
    setSaved(false);
  };

  const removeField = (index: number) => {
    setFields((fs) => fs.filter((_, i) => i !== index));
    setSaved(false);
  };

  const isSaving =
    createDocumentType.isPending ||
    updateDocumentType.isPending ||
    createVersion.isPending ||
    publishVersion.isPending;

  const handleSaveAll = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(true);
      return;
    }
    setNameError(false);

    let typeId = documentTypeId;
    if (typeId === undefined) {
      const created = await createDocumentType.mutateAsync({ name: trimmedName });
      typeId = created.id;
      setDocumentTypeId(created.id);
    } else {
      await updateDocumentType.mutateAsync({ documentTypeId: typeId, name: trimmedName });
    }

    if (fields.length > 0) {
      const fieldsToSave = fields.map(toFieldDefinition);
      const version = await createVersion.mutateAsync({
        documentTypeId: typeId,
        fields_schema: fieldsToSave,
        reference_document_id: documentId ?? null,
      });
      await publishVersion.mutateAsync({ documentTypeId: typeId, versionId: version.id });
    }

    setSaved(true);
  };

  const previewKind = previewDoc ? guessPreviewKind(previewDoc.original_filename) : null;

  const handleSplitPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
  };

  const handleSplitPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !splitRef.current) return;
    const rect = splitRef.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setLeftWidth(Math.min(70, Math.max(20, pct)));
  };

  const handleSplitPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg)" }}>
      {/* Barra de herramientas superior: volver, nombre (horizontal), guardar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          padding: "10px 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          gap: 16,
        }}
      >
        <Link
          to="/tipos-documento"
          style={{
            justifySelf: "start",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-muted)",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          <ArrowLeft size={16} /> Tipos de documento
        </Link>

        <div style={{ justifySelf: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(false);
              setSaved(false);
            }}
            placeholder="Nombre del tipo de documento *"
            style={{
              fontSize: 15,
              fontWeight: 600,
              textAlign: "center",
              border: `1px solid ${nameError ? "var(--danger)" : "var(--border)"}`,
              borderRadius: 8,
              padding: "7px 14px",
              background: "var(--surface)",
              width: 340,
            }}
          />
          {nameError && (
            <span style={{ color: "var(--danger)", fontSize: 11, marginTop: 3 }}>El nombre es obligatorio.</span>
          )}
        </div>

        <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: 10 }}>
          {saved && (
            <span className="badge badge-success">
              <CheckCircle2 size={13} /> Guardado
            </span>
          )}
          <button className="btn btn-primary" onClick={handleSaveAll} disabled={isSaving}>
            {isSaving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            {isSaving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      <div ref={splitRef} style={{ flex: 1, minHeight: 0, display: "flex", position: "relative" }}>
        {/* Izquierda: documento de referencia */}
        <div
          style={{
            width: `${leftWidth}%`,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            background: "var(--surface)",
          }}
        >
          <div
            style={{
              padding: "12px 18px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text)",
              }}
            >
              <FileText size={16} color="var(--primary)" /> Documento de referencia
            </span>
            {documentId && (
              <label
                className="btn"
                style={{ fontSize: 12, padding: "6px 12px", cursor: "pointer" }}
              >
                <RefreshCw size={13} /> Cambiar
                <input
                  type="file"
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                  disabled={uploadDocument.isPending}
                  style={{ display: "none" }}
                />
              </label>
            )}
          </div>

          {!documentId ? (
            <div style={{ padding: 18, display: "flex", flex: 1, alignItems: "center" }}>
              <div
                style={{
                  width: "100%",
                  textAlign: "center",
                  padding: "26px 20px",
                  border: "1.5px dashed var(--border)",
                  borderRadius: "var(--radius)",
                  background: "var(--bg)",
                }}
              >
                <div
                  className="icon-badge"
                  style={{ margin: "0 auto 12px", background: "var(--primary-bg)", color: "var(--primary)" }}
                >
                  <UploadCloud size={20} />
                </div>
                <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Sube un documento de ejemplo</h3>
                <p style={{ margin: "0 0 14px", color: "var(--text-muted)", fontSize: 13 }}>
                  Lo vamos a usar para que el asistente identifique los campos disponibles.
                </p>
                <label className="btn btn-primary" style={{ cursor: "pointer" }}>
                  <UploadCloud size={16} />
                  {uploadDocument.isPending ? "Subiendo..." : "Elegir archivo"}
                  <input
                    type="file"
                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                    disabled={uploadDocument.isPending}
                    style={{ display: "none" }}
                  />
                </label>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, padding: 12, display: "flex", flexDirection: "column" }}>
              {previewKind === "pdf" && (
                <>
                  <iframe
                    title="preview"
                    src={getDocumentFileUrl(documentId)}
                    style={{
                      width: "100%",
                      flex: 1,
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      pointerEvents: isDragging ? "none" : "auto",
                    }}
                  />
                  <a
                    href={getDocumentFileUrl(documentId)}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 12,
                      marginTop: 8,
                      alignSelf: "flex-start",
                    }}
                  >
                    <ExternalLink size={12} /> ¿No se ve el documento? Ábrelo en una pestaña nueva
                  </a>
                </>
              )}
              {previewKind === "image" && (
                <img
                  src={getDocumentFileUrl(documentId)}
                  alt="preview del documento"
                  style={{ width: "100%", objectFit: "contain", border: "1px solid var(--border)", borderRadius: 8 }}
                />
              )}
              {previewKind === "other" && (
                <p style={{ color: "var(--text-muted)" }}>
                  No hay previsualización disponible para este formato ({previewDoc?.original_filename}).
                </p>
              )}
              {!previewKind && <Spinner center size={24} />}
            </div>
          )}
        </div>

        {/* Barra divisora arrastrable */}
        <div
          onPointerDown={handleSplitPointerDown}
          onPointerMove={handleSplitPointerMove}
          onPointerUp={handleSplitPointerUp}
          onPointerCancel={handleSplitPointerUp}
          style={{
            width: 6,
            flexShrink: 0,
            cursor: "col-resize",
            background: isDragging ? "var(--primary)" : "var(--border)",
            position: "relative",
            touchAction: "none",
          }}
          title="Arrastra para ajustar el ancho"
        >
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 4,
              height: 36,
              borderRadius: 2,
              background: "var(--text-muted)",
              opacity: 0.5,
            }}
          />
        </div>

        {/* Derecha: chat + campos configurados */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text)",
              }}
            >
              <Sparkles size={16} color="var(--accent)" /> Asistente de configuración
            </span>
          </div>

          <div ref={transcriptRef} style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 18 }}>
            {!documentId && fields.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--text-muted)", marginTop: 40 }}>
                <Sparkles size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
                <p>Sube un documento a la izquierda para empezar a chatear.</p>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: m.role === "user" ? "row-reverse" : "row",
                  gap: 8,
                  marginBottom: 14,
                }}
              >
                <div className={`avatar ${m.role === "user" ? "avatar-user" : "avatar-assistant"}`}>
                  {m.role === "user" ? <User size={15} /> : <Bot size={15} />}
                </div>
                <div
                  style={{
                    maxWidth: "75%",
                    padding: "10px 14px",
                    borderRadius: 14,
                    borderTopRightRadius: m.role === "user" ? 4 : 14,
                    borderTopLeftRadius: m.role === "user" ? 14 : 4,
                    background: m.role === "user" ? "var(--primary)" : "var(--neutral-bg)",
                    color: m.role === "user" ? "white" : "var(--text)",
                    fontSize: 14,
                    boxShadow: "var(--shadow)",
                  }}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {chat.isPending && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
                <div className="avatar avatar-assistant">
                  <Bot size={15} />
                </div>
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: 14,
                    borderTopLeftRadius: 4,
                    background: "var(--neutral-bg)",
                    display: "flex",
                    gap: 4,
                  }}
                >
                  <span className="typing-dot" style={{ animationDelay: "0s" }} />
                  <span className="typing-dot" style={{ animationDelay: "0.15s" }} />
                  <span className="typing-dot" style={{ animationDelay: "0.3s" }} />
                </div>
              </div>
            )}

            {fields.length > 0 && (
              <div className="card" style={{ marginTop: 12 }}>
                <h4
                  style={{
                    marginTop: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Table2 size={16} color="var(--primary)" /> Campos — revisa y confirma
                </h4>
                <table>
                  <thead>
                    <tr>
                      <th>Campo</th>
                      <th>Tipo de dato</th>
                      <th>Obligatorio</th>
                      <th>Evidencia extraída</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f, i) => {
                      const Icon = DATA_TYPE_ICON[f.data_type];
                      return (
                        <tr key={i}>
                          <td>
                            <input
                              value={f.name}
                              onChange={(e) => updateField(i, { name: e.target.value })}
                              style={{ width: 140 }}
                            />
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Icon size={15} color="var(--text-muted)" />
                              <select
                                value={f.data_type}
                                onChange={(e) => updateField(i, { data_type: e.target.value as DataType })}
                              >
                                {(Object.keys(DATA_TYPE_LABEL) as DataType[]).map((dt) => (
                                  <option key={dt} value={dt}>
                                    {DATA_TYPE_LABEL[dt]}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              checked={f.required}
                              onChange={(e) => updateField(i, { required: e.target.checked })}
                            />
                          </td>
                          <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                            {f.data_type === "tabla"
                              ? `${f.sample_rows?.length ?? 0} fila(s) de ejemplo`
                              : formatValue(f.sample_value)}
                          </td>
                          <td>
                            <button
                              className="icon-btn"
                              onClick={() => removeField(i)}
                              title="Quitar campo"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {fields
                  .filter((f) => f.data_type === "tabla" && f.columns && f.sample_rows)
                  .map((f, i) => (
                    <div key={i} style={{ marginTop: 14 }}>
                      <p
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          margin: "0 0 6px",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Table2 size={13} /> Vista previa de la tabla detectada: "{f.name}"
                      </p>
                      <div style={{ overflowX: "auto" }}>
                        <table>
                          <thead>
                            <tr>
                              {f.columns!.map((c) => (
                                <th key={c.name}>
                                  {c.name} <span style={{ fontWeight: 400 }}>({DATA_TYPE_LABEL[c.data_type]})</span>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {f.sample_rows!.map((row, ri) => (
                              <tr key={ri}>
                                {f.columns!.map((c) => (
                                  <td key={c.name}>{formatValue(row[c.name])}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div style={{ padding: 14, borderTop: "1px solid var(--border)", background: "var(--surface)", display: "flex", gap: 8 }}>
            <input
              style={{
                flex: 1,
                borderRadius: "var(--radius)",
                padding: "10px 14px",
                border: "1px solid var(--border)",
                background: "var(--bg)",
              }}
              placeholder={documentId ? "Ej: extrae el RUT del cliente, obligatorio" : "Sube un documento primero"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={!documentId || chat.isPending}
            />
            <button
              className="btn btn-primary"
              style={{ borderRadius: "var(--radius)", width: 42, padding: 0, justifyContent: "center" }}
              onClick={handleSend}
              disabled={!documentId || !input.trim() || chat.isPending}
              title="Enviar"
            >
              <Send size={17} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
