import { Link } from "react-router-dom";
import { useDocumentTypes } from "../api/documentTypes";
import { useExecutions } from "../api/executions";
import { useWorkflows } from "../api/workflows";
import { useRole } from "../state/role";
import type { Role } from "../api/types";

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Como administrador puedes configurar tipos de documento, diseñar workflows y revisar alertas de baja confianza.",
  operador: "Como operador puedes ejecutar workflows: subir documentos y ver cómo avanza el pipeline de extracción.",
  revisor: "Como revisor puedes ver las ejecuciones que quedaron con baja confianza y requieren atención.",
};

interface StepCard {
  num: number;
  title: string;
  description: string;
  to: string;
  roles: Role[];
  stat: string;
}

export function HomePage() {
  const { role } = useRole();
  const { data: types } = useDocumentTypes();
  const { data: executions } = useExecutions();
  const { data: needsReview } = useExecutions({ hasIssues: true });
  const { data: workflows } = useWorkflows();

  const publishedCount = types?.filter((t) => t.status === "published").length ?? 0;
  const processedCount = executions?.length ?? 0;
  const needsReviewCount = needsReview?.length ?? 0;
  const workflowCount = workflows?.length ?? 0;

  const steps: StepCard[] = [
    {
      num: 1,
      title: "Configura un tipo de documento",
      description:
        "Define con el editor visual qué campos extraer de cada tipo de documento, su tipo de dato y sus reglas de validación.",
      to: "/tipos-documento",
      roles: ["admin"],
      stat: `${publishedCount} tipo(s) publicado(s)`,
    },
    {
      num: 2,
      title: "Diseña y ejecuta un workflow",
      description:
        "Arma un flujo (cargar documento → tipo a extraer → validaciones → destino) y súbele documentos para procesarlos con IA.",
      to: "/workflows",
      roles: ["admin", "operador"],
      stat: `${workflowCount} workflow(s) · ${processedCount} documento(s) procesado(s)`,
    },
    {
      num: 3,
      title: "Revisa alertas de baja confianza",
      description:
        "Mira las ejecuciones que quedaron con campos de baja confianza o campos obligatorios ausentes.",
      to: "/revision",
      roles: ["admin", "operador", "revisor"],
      stat: `${needsReviewCount} alerta(s) pendiente(s)`,
    },
  ];

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-header">
        <h2>Plataforma de extracción de documentos</h2>
        <p>{ROLE_DESCRIPTIONS[role]}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {steps.map((step) => {
          const allowed = step.roles.includes(role);
          return (
            <div key={step.num} className="card" style={{ opacity: allowed ? 1 : 0.55 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "var(--primary-bg)",
                  color: "var(--primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  marginBottom: 12,
                }}
              >
                {step.num}
              </div>
              <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>{step.title}</h3>
              <p style={{ margin: "0 0 12px", color: "var(--text-muted)", fontSize: 13 }}>
                {step.description}
              </p>
              <span className="badge" style={{ marginBottom: 14, display: "inline-flex" }}>
                {step.stat}
              </span>
              <div>
                {allowed ? (
                  <Link to={step.to} className="btn btn-primary">
                    Ir a esta pantalla →
                  </Link>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Cambia tu rol activo (arriba a la derecha) para acceder
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
