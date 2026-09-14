import { describe, expect, it } from "vitest";
import { makeExecution, makeMappedField } from "../test-utils/executionFixtures";
import { displayExecutionStatus, hasUnresolvedIssues } from "./executionStatus";

describe("hasUnresolvedIssues", () => {
  it("es false cuando no hay campos con problema", () => {
    const exec = makeExecution({ mapped_fields: [makeMappedField({ status: "ok" })] });
    expect(hasUnresolvedIssues(exec)).toBe(false);
  });

  it("es true cuando hay un campo needs_review sin resolver", () => {
    const exec = makeExecution({
      mapped_fields: [makeMappedField({ status: "needs_review", resolved: false })],
    });
    expect(hasUnresolvedIssues(exec)).toBe(true);
  });

  it("es false cuando el unico campo con problema ya fue resuelto", () => {
    const exec = makeExecution({
      mapped_fields: [makeMappedField({ status: "missing", resolved: true })],
    });
    expect(hasUnresolvedIssues(exec)).toBe(false);
  });
});

describe("displayExecutionStatus", () => {
  it("muestra 'resuelta' cuando el status es needs_review pero ya no hay problemas pendientes", () => {
    const result = displayExecutionStatus("needs_review", false);
    expect(result).toEqual({ label: "resuelta", badgeClass: "badge-success" });
  });

  it("mantiene needs_review visible mientras haya problemas pendientes", () => {
    const result = displayExecutionStatus("needs_review", true);
    expect(result.label).toBe("needs_review");
    expect(result.badgeClass).toBe("badge-warning");
  });

  it("mapea completed al badge de exito", () => {
    const result = displayExecutionStatus("completed", false);
    expect(result).toEqual({ label: "completed", badgeClass: "badge-success" });
  });
});
