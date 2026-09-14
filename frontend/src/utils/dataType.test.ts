import { describe, expect, it } from "vitest";
import { isNumericDataType } from "./dataType";

describe("isNumericDataType", () => {
  it("considera numero y porcentaje como numéricos", () => {
    expect(isNumericDataType("numero")).toBe(true);
    expect(isNumericDataType("porcentaje")).toBe(true);
  });

  it("no considera texto, fecha, booleano o tabla como numéricos", () => {
    expect(isNumericDataType("texto")).toBe(false);
    expect(isNumericDataType("fecha")).toBe(false);
    expect(isNumericDataType("booleano")).toBe(false);
    expect(isNumericDataType("tabla")).toBe(false);
  });
});
