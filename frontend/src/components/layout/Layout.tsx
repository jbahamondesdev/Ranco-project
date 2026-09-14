import { Link, NavLink, Outlet } from "react-router-dom";
import { AlertTriangle, BarChart3, ChevronDown, Layers, Settings2, Workflow } from "lucide-react";
import { useRole } from "../../state/role";
import { useUnseenIssuesCount } from "../../api/executions";
import type { Role } from "../../api/types";

const NAV_ITEMS: { to: string; label: string; subtitle: string; icon: typeof Settings2; roles: Role[] }[] = [
  {
    to: "/tipos-documento",
    label: "Configurar tipos",
    subtitle: "Campos y reglas por tipo de documento",
    icon: Settings2,
    roles: ["admin"],
  },
  {
    to: "/workflows",
    label: "Workflows",
    subtitle: "Diseñar y ejecutar flujos de procesamiento",
    icon: Workflow,
    roles: ["admin", "operador"],
  },
  {
    to: "/revision",
    label: "Revisión",
    subtitle: "Ejecuciones con baja confianza que requieren atención",
    icon: AlertTriangle,
    roles: ["admin", "operador", "revisor"],
  },
  {
    to: "/dashboard",
    label: "Dashboard",
    subtitle: "Métricas agregadas del pipeline",
    icon: BarChart3,
    roles: ["admin", "operador", "revisor"],
  },
];

export function Layout() {
  const { role, setRole } = useRole();
  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));
  const { data: unseenIssues } = useUnseenIssuesCount();
  const unseenCount = unseenIssues?.count ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header
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
          to="/"
          style={{
            justifySelf: "start",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
            color: "inherit",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          <span
            className="icon-badge"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "linear-gradient(135deg, var(--primary), var(--accent))",
              color: "white",
            }}
          >
            <Layers size={16} />
          </span>
          Plataforma de extracción
        </Link>

        <nav
          style={{
            justifySelf: "center",
            display: "flex",
            gap: 2,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: 4,
          }}
        >
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                style={({ isActive }) => ({
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  textDecoration: "none",
                  padding: "7px 14px",
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 600,
                  color: isActive ? "white" : "var(--text-muted)",
                  background: isActive ? "var(--primary)" : "transparent",
                  transition: "background 0.15s, color 0.15s",
                })}
                title={item.subtitle}
              >
                <span style={{ position: "relative", display: "inline-flex" }}>
                  <Icon size={15} />
                  {item.to === "/revision" && unseenCount > 0 && (
                    <span
                      style={{
                        position: "absolute",
                        top: -7,
                        right: -9,
                        minWidth: 14,
                        height: 14,
                        padding: "0 3px",
                        borderRadius: 999,
                        background: "var(--danger)",
                        color: "white",
                        fontSize: 9,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        lineHeight: 1,
                      }}
                    >
                      {unseenCount > 99 ? "99+" : unseenCount}
                    </span>
                  )}
                </span>
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <label
          style={{
            justifySelf: "end",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "var(--text-muted)",
          }}
          title="Define qué secciones ves (no hay login en esta versión)"
        >
          Rol:
          <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              style={{
                appearance: "none",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "6px 26px 6px 10px",
                fontSize: 13,
                color: "var(--text)",
                background: "var(--surface)",
              }}
            >
              <option value="admin">Administrador</option>
              <option value="operador">Operador</option>
              <option value="revisor">Revisor</option>
            </select>
            <ChevronDown
              size={14}
              style={{ position: "absolute", right: 8, pointerEvents: "none", color: "var(--text-muted)" }}
            />
          </span>
        </label>
      </header>
      <main style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
