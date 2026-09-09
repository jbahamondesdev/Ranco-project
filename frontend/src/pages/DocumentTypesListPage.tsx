import { Link } from "react-router-dom";
import {
  Calendar,
  CheckCircle2,
  FileText,
  Inbox,
  PenLine,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { useDeleteDocumentType, useDocumentTypes } from "../api/documentTypes";
import { extractErrorMessage } from "../api/errors";
import { Spinner } from "../components/common/Spinner";
import type { DocumentType } from "../api/types";

export function DocumentTypesListPage() {
  const { data: types, isLoading } = useDocumentTypes();
  const deleteDocumentType = useDeleteDocumentType();

  const handleDelete = async (e: React.MouseEvent, t: DocumentType) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`¿Eliminar el tipo de documento "${t.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteDocumentType.mutateAsync(t.id);
    } catch (err) {
      window.alert(extractErrorMessage(err, "No se pudo eliminar el tipo de documento."));
    }
  };

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div
        className="page-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}
      >
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <span
            className="icon-badge"
            style={{
              background: "linear-gradient(135deg, var(--primary), var(--accent))",
              color: "white",
            }}
          >
            <Settings2 size={18} />
          </span>
          <div>
            <h2 style={{ margin: 0 }}>Configurar tipos de documento</h2>
            <p style={{ margin: "4px 0 0" }}>Cada tipo define qué campos extraer y con qué reglas de validación.</p>
          </div>
        </div>
        <Link to="/tipos-documento/nuevo" className="btn btn-primary">
          <Plus size={16} /> Crear tipo de documento
        </Link>
      </div>

      {isLoading && <Spinner center size={28} />}

      {types && types.length === 0 && (
        <div className="empty-state">
          <div
            className="icon-badge icon-badge-lg"
            style={{ margin: "0 auto 16px", background: "var(--neutral-bg)", color: "var(--text-muted)" }}
          >
            <Inbox size={26} />
          </div>
          <h3>Todavía no existe ningún tipo de documento</h3>
          <p>Crea el primero para empezar a definir sus campos con el asistente.</p>
        </div>
      )}

      {types && types.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {types.map((t) => (
            <Link
              key={t.id}
              to={`/tipos-documento/${t.id}`}
              className="card"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                textDecoration: "none",
                color: "inherit",
                padding: "14px 18px",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--primary)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            >
              <span className="icon-badge" style={{ background: "var(--primary-bg)", color: "var(--primary)" }}>
                <FileText size={17} />
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
              </div>

              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  color: "var(--text-muted)",
                  flexShrink: 0,
                }}
              >
                <Calendar size={13} />
                {new Date(t.created_at).toLocaleDateString()}
              </span>

              <span className={`badge ${t.status === "published" ? "badge-success" : ""}`} style={{ flexShrink: 0 }}>
                {t.status === "published" ? <CheckCircle2 size={13} /> : <PenLine size={13} />}
                {t.status === "published" ? "Publicado" : "Borrador"}
              </span>

              <button
                className="icon-btn"
                title="Eliminar"
                onClick={(e) => handleDelete(e, t)}
                disabled={deleteDocumentType.isPending}
                style={{ flexShrink: 0 }}
              >
                <Trash2 size={14} />
              </button>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
