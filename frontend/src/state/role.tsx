import { createContext, useContext, useState, type ReactNode } from "react";
import type { Role } from "../api/types";

const STORAGE_KEY = "active-role";

interface RoleContextValue {
  role: Role;
  setRole: (role: Role) => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

function readStoredRole(): Role {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "admin" || stored === "operador" || stored === "revisor") return stored;
  return "admin";
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(readStoredRole);

  const setRole = (next: Role) => {
    setRoleState(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole debe usarse dentro de RoleProvider");
  return ctx;
}
