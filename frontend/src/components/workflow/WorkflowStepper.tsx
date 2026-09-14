import { Children, Fragment, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export type StepperOrientation = "vertical" | "horizontal";

// Reemplaza el lienzo de React Flow: la topología de un workflow es siempre la misma
// cadena fija de 4 pasos (ver workflow/graph.ts), nadie puede reordenarla ni agregar
// pasos, así que no hace falta un canvas de diagramas con pan/zoom/drag — un listado
// de tarjetas conectadas por una flecha alcanza, y es mucho más liviano.
export function WorkflowStepper({
  orientation,
  children,
}: {
  orientation: StepperOrientation;
  children: ReactNode;
}) {
  const steps = Children.toArray(children);
  const vertical = orientation === "vertical";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: vertical ? "column" : "row",
        alignItems: "center",
        justifyContent: vertical ? "flex-start" : "center",
        padding: 32,
        minHeight: "100%",
        width: "100%",
        overflow: "auto",
      }}
    >
      {steps.map((step, i) => (
        <Fragment key={i}>
          {step}
          {i < steps.length - 1 && (
            <div
              style={{
                flexShrink: 0,
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: vertical ? 30 : 28,
                height: vertical ? 28 : 30,
              }}
            >
              {vertical ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}
