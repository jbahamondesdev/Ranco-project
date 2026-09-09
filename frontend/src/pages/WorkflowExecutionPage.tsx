import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ReactFlow, Background, Controls } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Database, FileCheck2, FileText, UploadCloud } from "lucide-react";
import { TERMINAL_STATUSES, useExecution, useMarkExecutionSeen } from "../api/executions";
import { useWorkflow } from "../api/workflows";
import { loadWorkflowLayout } from "../utils/workflowLayout";
import { Spinner } from "../components/common/Spinner";
import { NodeDetailPanel } from "../components/workflow/NodeDetailPanel";
import {
  ExecutionStepNode,
  type ExecutionStepNodeType,
} from "../components/workflow/ExecutionStepNode";
import { useResizableSplit } from "../hooks/useResizableSplit";
import { FIXED_EDGES, INITIAL_POSITIONS, type NodeId } from "../workflow/graph";
import { displayExecutionStatus, hasUnresolvedIssues } from "../workflow/executionStatus";
import { computeNodeStatuses, nodeSummary } from "../workflow/nodeStatus";

const nodeTypes = { executionStep: ExecutionStepNode };

const PANEL_MIN_WIDTH = 360;
const PANEL_MAX_WIDTH = 760;
const PANEL_DEFAULT_WIDTH = 460;

export function WorkflowExecutionPage() {
  const { workflowId, executionId } = useParams();
  const { data: workflow } = useWorkflow(workflowId);
  const { data: execution } = useExecution(executionId);
  const [selectedNode, setSelectedNode] = useState<NodeId>();
  const {
    size: panelWidth,
    isDragging: isResizingPanel,
    containerRef: splitRef,
    onPointerDown: handleResizePointerDown,
    onPointerMove: handleResizePointerMove,
    onPointerUp: handleResizePointerUp,
  } = useResizableSplit({ mode: "pixels", initial: PANEL_DEFAULT_WIDTH, min: PANEL_MIN_WIDTH, max: PANEL_MAX_WIDTH });
  const markSeen = useMarkExecutionSeen();
  // guarda para qué execution.id ya evaluamos el "primer dato recibido" — evita
  // re-evaluar en cada poll, pero se resetea naturalmente al navegar a otra ejecución
  // (la ruta no desmonta el componente al cambiar solo el parámetro)
  const seenCheckedForIdRef = useRef<string | null>(null);

  // solo marca "vista" si la ejecución YA estaba terminada la primera vez que llegan
  // los datos (abriste algo ya resuelto) — si la ves terminar en vivo (recién
  // disparada desde "Ejecutar"), no se marca sola: hay que volver a entrar después.
  useEffect(() => {
    if (!execution || seenCheckedForIdRef.current === execution.id) return;
    seenCheckedForIdRef.current = execution.id;
    if (!execution.seen && TERMINAL_STATUSES.includes(execution.status)) {
      markSeen.mutate(execution.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execution]);

  const layout = useMemo(
    () => (workflowId ? loadWorkflowLayout(workflowId) : null) ?? INITIAL_POSITIONS,
    [workflowId]
  );

  const nodes: ExecutionStepNodeType[] = useMemo(() => {
    if (!execution) return [];
    const statuses = computeNodeStatuses(execution);
    const defs: { id: NodeId; icon: React.ReactNode; tone: "primary" | "accent" | "warning" | "success"; step: number; title: string; showTarget?: boolean; showSource?: boolean }[] = [
      { id: "trigger", icon: <UploadCloud size={15} />, tone: "primary", step: 1, title: "Cargar documentos", showTarget: false },
      { id: "documentType", icon: <FileText size={15} />, tone: "accent", step: 2, title: "Tipo de documento" },
      { id: "validation", icon: <FileCheck2 size={15} />, tone: "warning", step: 3, title: "Validaciones" },
      { id: "destination", icon: <Database size={15} />, tone: "success", step: 4, title: "Destino", showSource: false },
    ];

    return defs.map((d) => ({
      id: d.id,
      type: "executionStep",
      position: layout[d.id] ?? INITIAL_POSITIONS[d.id],
      data: {
        icon: d.icon,
        tone: d.tone,
        step: d.step,
        title: d.title,
        showTarget: d.showTarget,
        showSource: d.showSource,
        status: statuses[d.id],
        summary: nodeSummary(d.id, execution, statuses[d.id]),
        selected: selectedNode === d.id,
        onSelect: () => setSelectedNode(d.id),
      },
    }));
  }, [execution, layout, selectedNode]);

  if (!execution) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <Spinner size={24} />
      </div>
    );
  }

  const status = displayExecutionStatus(execution.status, hasUnresolvedIssues(execution));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          padding: "10px 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          gap: 16,
        }}
      >
        <Link
          to="/workflows"
          style={{
            justifySelf: "start",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-muted)",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          <ArrowLeft size={16} /> Workflows
        </Link>

        <div style={{ justifySelf: "center", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            {workflow?.name ?? "Flujo"} — Ejecución {execution.id}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Inicio: {new Date(execution.started_at).toLocaleString()}
          </div>
        </div>

        <div style={{ justifySelf: "end" }}>
          <span className={`badge ${status.badgeClass}`}>{status.label}</span>
        </div>
      </div>

      <div ref={splitRef} style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ReactFlow
            nodes={nodes}
            edges={FIXED_EDGES}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
            fitView
            fitViewOptions={{ padding: 0.3 }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        {selectedNode && (
          <>
            <div
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onPointerCancel={handleResizePointerUp}
              title="Arrastra para ajustar el ancho del panel"
              style={{
                width: 6,
                flexShrink: 0,
                cursor: "col-resize",
                background: isResizingPanel ? "var(--primary)" : "var(--border)",
                touchAction: "none",
              }}
            />
            <NodeDetailPanel
              key={selectedNode}
              nodeId={selectedNode}
              execution={execution}
              onClose={() => setSelectedNode(undefined)}
              width={panelWidth}
            />
          </>
        )}
      </div>
    </div>
  );
}
