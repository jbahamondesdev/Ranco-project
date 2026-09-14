import { useRef, useState, type PointerEvent } from "react";

interface UseResizableSplitOptions {
  /** "percentage": tamaño 0-100 medido desde el borde inicial del contenedor (izquierda
   *  en horizontal, arriba en vertical). "pixels": tamaño en px medido desde el borde
   *  final (derecha en horizontal, abajo en vertical). */
  mode: "percentage" | "pixels";
  /** "horizontal" (default): arrastre en X, divide en columnas. "vertical": arrastre
   *  en Y, divide en filas. */
  axis?: "horizontal" | "vertical";
  initial: number;
  min: number;
  max: number;
}

// Hook compartido para los splitters arrastrables de la app (documento/chat y
// chat/campos en DocumentTypeConfigPage, panel de detalle en WorkflowExecutionPage) —
// misma mecánica de Pointer Events, distinto cálculo de tamaño según modo y eje.
export function useResizableSplit({ mode, axis = "horizontal", initial, min, max }: UseResizableSplitOptions) {
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
    let raw: number;
    if (axis === "horizontal") {
      raw = mode === "percentage" ? ((e.clientX - rect.left) / rect.width) * 100 : rect.right - e.clientX;
    } else {
      raw = mode === "percentage" ? ((e.clientY - rect.top) / rect.height) * 100 : rect.bottom - e.clientY;
    }
    setSize(Math.min(max, Math.max(min, raw)));
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
  };

  return { size, isDragging, containerRef, onPointerDown, onPointerMove, onPointerUp };
}
