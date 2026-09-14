import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  History,
  Loader2,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Table2,
  Trash2,
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
import { useDocumentChat, usePreviewExtraction } from "../api/chat";
import { extractErrorMessage } from "../api/errors";
import { Spinner } from "../components/common/Spinner";
import { MappedFieldValue } from "../components/workflow/MappedFieldValue";
import { diffFieldSchemas } from "../utils/fieldSchemaDiff";
import { guessPreviewKind } from "../utils/documentPreview";
import { DATA_TYPE_ICON, DATA_TYPE_LABEL } from "../utils/dataType";
import { useResizableSplit } from "../hooks/useResizableSplit";
import type {
  ChatMessage,
  DataType,
  FieldDefinition,
  MappedFieldPreview,
  PrimitiveValue,
  SuggestedField,
} from "../api/types";

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
    description: field.description ?? null,
    columns:
      field.data_type === "tabla" && field.columns
        ? field.columns.map((c) => ({
            name: c.name,
            data_type: c.data_type,
            required: false,
            validation_rules: [],
            description: c.description ?? null,
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
    description: field.description ?? null,
    columns: field.columns?.map((c) => ({ name: c.name, data_type: c.data_type, description: c.description ?? null })) ?? null,
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
  const previewExtraction = usePreviewExtraction();

  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(false);
  const [saved, setSaved] = useState(false);
  const prefilledRef = useRef(false);

  const {
    size: leftWidth,
    isDragging,
    containerRef: splitRef,
    onPointerDown: handleSplitPointerDown,
    onPointerMove: handleSplitPointerMove,
    onPointerUp: handleSplitPointerUp,
  } = useResizableSplit({ mode: "percentage", initial: 42, min: 20, max: 70 });

  // divide el panel derecho en chat (arriba) y campos/resultados (abajo) - separados
  // para que "Probar extracción" no quede mezclada con la conversación del chat
  const {
    size: chatHeight,
    isDragging: isDraggingChatSplit,
    containerRef: chatFieldsSplitRef,
    onPointerDown: handleChatSplitPointerDown,
    onPointerMove: handleChatSplitPointerMove,
    onPointerUp: handleChatSplitPointerUp,
  } = useResizableSplit({ mode: "percentage", axis: "vertical", initial: 40, min: 20, max: 75 });

  const [documentId, setDocumentId] = useState<string>();
  const { data: previewDoc } = useDocument(documentId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [fields, setFields] = useState<SuggestedField[]>([]);
  const [input, setInput] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);

  // resultados de "Probar extracción" (mismo motor que la ejecución real, ver
  // routers/chat.py::preview_extraction) - reemplazan la aproximacion que sugiere el
  // chat una vez que el usuario prueba de verdad
  const [previewResults, setPreviewResults] = useState<MappedFieldPreview[]>([]);

  // corre "Probar extracción" para un set de campos dado - se usa tanto desde el botón
  // (campos tal como estan en pantalla) como automaticamente despues de que el chat
  // devuelve campos nuevos/editados (ver handleSend), para no tener que apretar el
  // botón cada vez que se le pide algo al asistente. Los cambios manuales en la tabla
  // (updateField/removeField) siguen siendo solo con el botón, a propósito.
  const runPreviewExtraction = async (fieldsToTest: SuggestedField[]) => {
    if (!documentId || fieldsToTest.length === 0) return;
    try {
      const res = await previewExtraction.mutateAsync({
        documentId,
        fieldsSchema: fieldsToTest.map(toFieldDefinition),
      });
      setPreviewResults(res.fields);
    } catch (err) {
      window.alert(extractErrorMessage(err, "No se pudo probar la extracción."));
    }
  };

  const handlePreviewExtraction = () => runPreviewExtraction(fields);

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

  // Historial de versiones (solo lectura) - no toca el estado editable de arriba.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [diffVersionId, setDiffVersionId] = useState<string>();
  useEffect(() => {
    if (docType && docType.versions.length > 0 && diffVersionId === undefined) {
      setDiffVersionId(docType.versions[docType.versions.length - 1].id);
    }
  }, [docType, diffVersionId]);
  const versions = docType?.versions ?? [];
  const diffVersionIndex = versions.findIndex((v) => v.id === diffVersionId);
  const diffVersion = diffVersionIndex >= 0 ? versions[diffVersionIndex] : undefined;
  const previousVersion = diffVersionIndex > 0 ? versions[diffVersionIndex - 1] : undefined;
  const diffEntries =
    diffVersion && previousVersion
      ? diffFieldSchemas(previousVersion.fields_schema, diffVersion.fields_schema)
      : [];

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
    setPreviewResults([]);
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
    // cada vez que el chat define/ajusta campos, se prueba la extracción real altiro -
    // el usuario no debería tener que apretar "Probar extracción" después de pedirle
    // algo al asistente, solo cuando edita un campo manualmente en la tabla
    await runPreviewExtraction(res.fields);
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

      {docType && docType.versions.length > 1 && (
        <div style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)", padding: "8px 24px" }}>
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-muted)",
              padding: 0,
            }}
          >
            {historyOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <History size={13} /> Historial de versiones ({docType.versions.length})
          </button>

          {historyOpen && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <select
                value={diffVersionId ?? ""}
                onChange={(e) => setDiffVersionId(e.target.value)}
                style={{ fontSize: 12, padding: "5px 8px", width: 200 }}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.version_number} — {v.status === "published" ? "publicada" : "borrador"}
                  </option>
                ))}
              </select>

              {!previousVersion && (
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                  Es la primera versión — no hay una anterior con la que compararla.
                </p>
              )}
              {previousVersion && diffEntries.length === 0 && (
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                  Sin cambios de campos respecto a v{previousVersion.version_number}.
                </p>
              )}
              {previousVersion && diffEntries.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                  {diffEntries.map((entry) => (
                    <li
                      key={entry.name}
                      style={{
                        color:
                          entry.kind === "added"
                            ? "var(--success)"
                            : entry.kind === "removed"
                              ? "var(--danger)"
                              : "var(--text)",
                      }}
                    >
                      {entry.kind === "added" && `+ ${entry.name} (nuevo campo)`}
                      {entry.kind === "removed" && `− ${entry.name} (eliminado)`}
                      {entry.kind === "changed" && `${entry.name}: ${entry.changes?.join(", ")}`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

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
            <div
              style={{
                flex: 1,
                minHeight: 0,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                pointerEvents: isDragging ? "none" : "auto",
                overflow: "auto",
              }}
            >
              {previewDoc ? (
                (() => {
                  const kind = guessPreviewKind(previewDoc.original_filename);
                  if (kind === "pdf") {
                    return (
                      <iframe
                        src={getDocumentFileUrl(documentId)}
                        title="Documento de referencia"
                        style={{ flex: 1, minHeight: 0, width: "100%", border: "1px solid var(--border)", borderRadius: 8 }}
                      />
                    );
                  }
                  if (kind === "image") {
                    return (
                      <img
                        src={getDocumentFileUrl(documentId)}
                        alt="Documento de referencia"
                        style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8 }}
                      />
                    );
                  }
                  return (
                    <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                      No hay previsualización disponible para este formato ({previewDoc.original_filename}).
                    </p>
                  );
                })()
              ) : (
                <Spinner center size={24} />
              )}
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
                <ExternalLink size={12} /> Abrir documento original en una pestaña nueva
              </a>
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

        {/* Derecha: chat (arriba) + campos/resultados (abajo), separados y cada uno
            con su propio scroll - antes los resultados quedaban mezclados dentro del
            scroll del chat */}
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

          <div ref={chatFieldsSplitRef} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {/* Conversación con el asistente - mensajes + input, ambos arriba */}
            <div
              style={{
                height: `${chatHeight}%`,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                pointerEvents: isDraggingChatSplit ? "none" : "auto",
              }}
            >
              <div ref={transcriptRef} style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 18 }}>
                {!documentId && messages.length === 0 && (
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

            {/* Divisor horizontal arrastrable */}
            <div
              onPointerDown={handleChatSplitPointerDown}
              onPointerMove={handleChatSplitPointerMove}
              onPointerUp={handleChatSplitPointerUp}
              onPointerCancel={handleChatSplitPointerUp}
              style={{
                height: 6,
                flexShrink: 0,
                cursor: "row-resize",
                background: isDraggingChatSplit ? "var(--primary)" : "var(--border)",
                position: "relative",
                touchAction: "none",
              }}
              title="Arrastra para ajustar el alto"
            >
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  background: "var(--text-muted)",
                  opacity: 0.5,
                }}
              />
            </div>

            {/* Campos definidos y resultados de "Probar extracción" */}
            <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 18 }}>
              {fields.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", marginTop: 20 }}>
                  Los campos que definas con el asistente van a aparecer acá.
                </p>
              ) : (
                <div className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <h4 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                      <Table2 size={16} color="var(--primary)" /> Campos — revisa y confirma
                    </h4>
                    <button
                      className="btn"
                      style={{ fontSize: 12, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}
                      onClick={handlePreviewExtraction}
                      disabled={previewExtraction.isPending || !documentId}
                      title="Corre el mismo motor de extracción que se usa al procesar un documento de verdad"
                    >
                      <Sparkles size={13} /> {previewExtraction.isPending ? "Probando..." : "Probar extracción"}
                    </button>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Campo</th>
                        <th>Tipo de dato</th>
                        <th>Obligatorio</th>
                        <th>Instrucciones (opcional)</th>
                        <th>Evidencia extraída</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map((f, i) => {
                        const Icon = DATA_TYPE_ICON[f.data_type];
                        const tested = previewResults.find((pf) => pf.field_name === f.name);
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
                            <td>
                              <input
                                value={f.description ?? ""}
                                onChange={(e) => updateField(i, { description: e.target.value || null })}
                                placeholder="ej: tomar el total fuera de la tabla"
                                title="Instrucción puntual para este campo - tiene prioridad sobre el criterio general del modelo"
                                style={{ width: 180, fontSize: 12 }}
                              />
                            </td>
                            <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                              {tested ? (
                                <>
                                  <MappedFieldValue field={tested} />
                                  {tested.confidence != null && (
                                    <span style={{ marginLeft: 6 }}>({(tested.confidence * 100).toFixed(0)}%)</span>
                                  )}
                                </>
                              ) : f.data_type === "tabla" ? (
                                `${f.sample_rows?.length ?? 0} fila(s) de ejemplo`
                              ) : (
                                formatValue(f.sample_value)
                              )}
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
          </div>
        </div>
      </div>
    </div>
  );
}
