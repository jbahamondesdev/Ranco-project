import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { Workflow, WorkflowDestination, WorkflowFieldThreshold, WorkflowTriggerType } from "./types";

export interface WorkflowPayload {
  name: string;
  document_type_id: string | null;
  destination: WorkflowDestination;
  trigger_type: WorkflowTriggerType;
  field_thresholds: Record<string, WorkflowFieldThreshold>;
}

export function useWorkflows() {
  return useQuery({
    queryKey: ["workflows"],
    queryFn: () => api.get<Workflow[]>("/workflows"),
    refetchInterval: 5000,
  });
}

export function useWorkflow(id: string | undefined) {
  return useQuery({
    queryKey: ["workflows", id],
    queryFn: () => api.get<Workflow>(`/workflows/${id}`),
    enabled: id !== undefined,
  });
}

export function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: WorkflowPayload) => api.post<Workflow>("/workflows", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflows"] }),
  });
}

export function useUpdateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, ...payload }: WorkflowPayload & { workflowId: string }) =>
      api.patch<Workflow>(`/workflows/${workflowId}`, payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["workflows", vars.workflowId] });
      qc.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}

export function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workflowId: string) => api.del<void>(`/workflows/${workflowId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflows"] });
      qc.invalidateQueries({ queryKey: ["executions"] });
    },
  });
}

export function usePauseWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workflowId: string) => api.post<Workflow>(`/workflows/${workflowId}/pause`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflows"] }),
  });
}

export function useResumeWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workflowId: string) => api.post<Workflow>(`/workflows/${workflowId}/resume`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflows"] }),
  });
}
