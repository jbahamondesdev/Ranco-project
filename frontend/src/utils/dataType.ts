import { Calendar, Hash, Percent, Table2, ToggleLeft, Type } from "lucide-react";
import type { DataType } from "../api/types";

export const DATA_TYPE_LABEL: Record<DataType, string> = {
  texto: "texto",
  numero: "número",
  fecha: "fecha",
  booleano: "booleano",
  tabla: "tabla",
  porcentaje: "porcentaje",
};

export const DATA_TYPE_ICON: Record<DataType, typeof Type> = {
  texto: Type,
  numero: Hash,
  fecha: Calendar,
  booleano: ToggleLeft,
  tabla: Table2,
  porcentaje: Percent,
};

// porcentaje se guarda como numero plano (ver mapping.py) - donde el resto del
// frontend trata un campo como "numérico" (umbrales min/max, etc.) debe incluirlo.
export function isNumericDataType(dataType: DataType): boolean {
  return dataType === "numero" || dataType === "porcentaje";
}
