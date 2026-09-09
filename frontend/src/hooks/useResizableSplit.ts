import { useRef, useState, type PointerEvent } from "react";

interface UseResizableSplitOptions {
  /** "percentage": tamaño 0-100 medido desde el borde izquierdo del contenedor.
   *  "pixels": tamaño en px medido desde el borde derecho del contenedor. */
  mode: "percentage" | "pixels";
  initial: number;
  min: number;
  max: number;
}

// Hook compartido para los dos splitters arrastrables de la app (documento/chat en
// DocumentTypeConfigPage, panel de detalle en WorkflowExecutionPage) — misma mecánica
// de Pointer Events, distinto cálculo de tamaño según el modo.
export function useResizableSplit({ mode, initial, min, max }: UseResizableSplitOptions) {
  const [size, setSize] = useState(initial);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const raw = mode === "percentage" ? ((e.clientX - rect.left) / rect.width) * 100 : rect.right - e.clientX;
    setSize(Math.min(max, Math.max(min, raw)));
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
  };

  return { size, isDragging, containerRef, onPointerDown, onPointerMove, onPointerUp };
}
