import { describe, expect, it } from "vitest";
import { makeEvent, makeExecution, makeMappedField } from "../test-utils/executionFixtures";
import { computeNodeStatuses, nodeSummary } from "./nodeStatus";

describe("computeNodeStatuses", () => {
  it("marca documentType activo mientras se extrae/mapea", () => {
    const exec = makeExecution({ status: "extracting" });
    const statuses = computeNodeStatuses(exec);
    expect(statuses).toEqual({
      trigger: "done",
      documentType: "active",
      validation: "pending",
      destination: "pending",
    });
  });

  it("marca todo done cuando esta completed sin issues", () => {
    const exec = makeExecution({ status: "completed", mapped_fields: [makeMappedField({ status: "ok" })] });
    const statuses = computeNodeStatuses(exec);
    expect(statuses.destination).toBe("done");
    expect(statuses.validation).toBe("done");
  });

  it("marca destination en warning cuando quedan issues sin resolver", () => {
    const exec = makeExecution({
      status: "needs_review",
      mapped_fields: [makeMappedField({ status: "needs_review", resolved: false })],
    });
    const statuses = computeNodeStatuses(exec);
    expect(statuses.destination).toBe("warning");
  });

  it("marca validation en warning si queda un campo warning sin resolver aunque todo lo demas este done", () => {
    const exec = makeExecution({
      status: "completed",
      mapped_fields: [makeMappedField({ status: "warning", resolved: false })],
    });
    const statuses = computeNodeStatuses(exec);
    expect(statuses.validation).toBe("warning");
  });

  it("en error, marca error solo en el nodo del ultimo stage fallido y done antes de el", () => {
    const exec = makeExecution({
      status: "error",
      error_message: "boom",
      events: [makeEvent({ stage: "extraction", status: "ok" }), makeEvent({ stage: "mapping", status: "error" })],
    });
    const statuses = computeNodeStatuses(exec);
    expect(statuses.trigger).toBe("done");
    expect(statuses.documentType).toBe("error");
    expect(statuses.validation).toBe("pending");
    expect(statuses.destination).toBe("pending");
  });
});

describe("nodeSummary", () => {
  it("muestra el mensaje de error cuando el nodo fallo", () => {
    const exec = makeExecution({ status: "error", error_message: "Azure no configurado" });
    expect(nodeSummary("documentType", exec, "error")).toBe("Azure no configurado");
  });

  it("resume validation con conteos ok/a revisar", () => {
    const exec = makeExecution({
      mapped_fields: [
        makeMappedField({ status: "ok" }),
        makeMappedField({ status: "needs_review", resolved: false }),
      ],
      confidence_threshold_used: 0.8,
    });
    const summary = nodeSummary("validation", exec, "done");
    expect(summary).toContain("1 ok");
    expect(summary).toContain("1 a revisar");
  });
});
