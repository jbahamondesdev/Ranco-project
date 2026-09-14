import { useState } from "react";
import type { StepperOrientation } from "../components/workflow/WorkflowStepper";

// Preferencia del usuario (compartida entre el editor y la vista de ejecución) sobre
// cómo ver la cadena de pasos del workflow — vertical u horizontal. Es solo una
// conveniencia visual de este navegador, no un dato del backend.
const KEY = "wf-stepper-orientation";

function readStored(): StepperOrientation {
  try {
    return localStorage.getItem(KEY) === "horizontal" ? "horizontal" : "vertical";
  } catch {
    return "vertical";
  }
}

export function useWorkflowOrientation() {
  const [orientation, setOrientationState] = useState<StepperOrientation>(readStored);

  const setOrientation = (next: StepperOrientation) => {
    setOrientationState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* localStorage lleno o deshabilitado: no es crítico, se ignora */
    }
  };

  return [orientation, setOrientation] as const;
}
