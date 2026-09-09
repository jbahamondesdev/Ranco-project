import { Calendar, Hash, Table2, ToggleLeft, Type } from "lucide-react";
import type { DataType } from "../api/types";

export const DATA_TYPE_LABEL: Record<DataType, string> = {
  texto: "texto",
  numero: "número",
  fecha: "fecha",
  booleano: "booleano",
  tabla: "tabla",
};

export const DATA_TYPE_ICON: Record<DataType, typeof Type> = {
  texto: Type,
  numero: Hash,
  fecha: Calendar,
  booleano: ToggleLeft,
  tabla: Table2,
};
