import { X } from "lucide-react";
import type { NodeId } from "../../workflow/graph";
import {
  DestinationNode,
  DocumentTypeNode,
  TriggerNode,
  ValidationNode,
  type DestinationNodeData,
  type DocumentTypeNodeData,
  type TriggerNodeData,
  type ValidationNodeData,
} from "./nodes";

const TITLES: Record<NodeId, string> = {
  trigger: "1. Cargar documentos",
  documentType: "2. Tipo de documento",
  validation: "3. Validaciones",
  destination: "4. Destino",
};

// Panel lateral que se abre al hacer clic en un paso del editor de workflow, con los
// campos reales de ese paso - mismo patrón que NodeDetailPanel en la vista de una
// ejecución (WorkflowExecutionPage), pero para editar la configuración en vez de ver
// un resultado. Cada paso vive en su propio componente (ver components/workflow/nodes)
// y este panel solo decide cuál mostrar según `nodeId`.
export function WorkflowStepPanel({
  nodeId,
  onClose,
  width,
  triggerData,
  documentTypeData,
  validationData,
  destinationData,
}: {
  nodeId: NodeId;
  onClose: () => void;
  width: number;
  triggerData: TriggerNodeData;
  documentTypeData: DocumentTypeNodeData;
  validationData: ValidationNodeData;
  destinationData: DestinationNodeData;
}) {
  return (
    <div style={{ width, flexShrink: 0, padding: 24, overflow: "auto", background: "var(--surface)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>{TITLES[nodeId]}</h3>
        <button className="icon-btn" onClick={onClose} title="Cerrar">
          <X size={16} />
        </button>
      </div>

      {nodeId === "trigger" && <TriggerNode data={triggerData} />}
      {nodeId === "documentType" && <DocumentTypeNode data={documentTypeData} />}
      {nodeId === "validation" && <ValidationNode data={validationData} />}
      {nodeId === "destination" && <DestinationNode data={destinationData} />}
    </div>
  );
}
