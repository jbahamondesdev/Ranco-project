import { describe, expect, it } from "vitest";
import type { FieldDefinition } from "../api/types";
import { diffFieldSchemas } from "./fieldSchemaDiff";

function field(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    name: "nombre",
    data_type: "texto",
    required: false,
    validation_rules: [],
    ...overrides,
  };
}

describe("diffFieldSchemas", () => {
  it("detecta campos agregados", () => {
    const diff = diffFieldSchemas([], [field({ name: "monto" })]);
    expect(diff).toEqual([{ name: "monto", kind: "added" }]);
  });

  it("detecta campos eliminados", () => {
    const diff = diffFieldSchemas([field({ name: "monto" })], []);
    expect(diff).toEqual([{ name: "monto", kind: "removed" }]);
  });

  it("detecta cambio de tipo de dato y de obligatoriedad", () => {
    const before = [field({ name: "monto", data_type: "texto", required: false })];
    const after = [field({ name: "monto", data_type: "numero", required: true })];

    const diff = diffFieldSchemas(before, after);

    expect(diff).toHaveLength(1);
    expect(diff[0].kind).toBe("changed");
    expect(diff[0].changes).toContain("tipo de dato: texto → numero");
    expect(diff[0].changes).toContain("obligatorio: no → sí");
  });

  it("no reporta nada cuando los esquemas son iguales", () => {
    const schema = [field({ name: "monto" })];
    expect(diffFieldSchemas(schema, schema)).toEqual([]);
  });
});
