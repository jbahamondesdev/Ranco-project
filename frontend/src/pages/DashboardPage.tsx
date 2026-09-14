import { BarChart3 } from "lucide-react";
import { useExecutionStats } from "../api/executions";
import { Spinner } from "../components/common/Spinner";
import { formatPercent } from "../utils/format";

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

export function DashboardPage() {
  const { data: stats, isLoading } = useExecutionStats();

  const needsReviewRate =
    stats && stats.total > 0 ? (stats.by_status["needs_review"] ?? 0) / stats.total : null;
  const maxTotal = stats ? Math.max(1, ...stats.by_document_type.map((t) => t.total)) : 1;

  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <div className="page-header" style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <span className="icon-badge" style={{ background: "var(--primary-bg)", color: "var(--primary)" }}>
          <BarChart3 size={18} />
        </span>
        <div>
          <h2 style={{ margin: 0 }}>Dashboard</h2>
          <p style={{ margin: "4px 0 0" }}>Métricas agregadas de todas las ejecuciones del pipeline.</p>
        </div>
      </div>

      {isLoading && <Spinner center size={28} />}

      {stats && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
            <StatCard label="Ejecuciones totales" value={String(stats.total)} />
            <StatCard label="Tasa de revisión" value={formatPercent(needsReviewRate)} />
            <StatCard label="Confianza promedio" value={formatPercent(stats.avg_confidence)} />
            <StatCard label="Duración promedio" value={formatDuration(stats.avg_duration_seconds)} />
          </div>

          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Por tipo de documento</h3>
          {stats.by_document_type.length === 0 ? (
            <div className="empty-state">
              <h3>Todavía no hay ejecuciones</h3>
              <p>Las métricas aparecerán acá en cuanto se procese el primer documento.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {stats.by_document_type.map((t) => (
                <div key={t.document_type_id} className="card" style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600 }}>{t.document_type_name}</span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {t.total} ejecución(es) · {t.needs_review} a revisar · confianza {formatPercent(t.avg_confidence)}
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: "var(--bg)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${(t.total / maxTotal) * 100}%`,
                        background: "var(--primary)",
                        borderRadius: 999,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
