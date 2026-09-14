import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, BASE_URL } from "./client";
import type { Execution, ExecutionDetail, ExecutionStats, MappedField } from "./types";

export const TERMINAL_STATUSES = ["completed", "error", "needs_review"];

export function getExecutionExportUrl(executionId: string): string {
  return `${BASE_URL}/executions/${executionId}/export`;
}

export function getWorkflowExportUrl(workflowId: string): string {
  return `${BASE_URL}/executions/export?workflow_id=${workflowId}`;
}

export function useExecutions(options?: { status?: string; workflowId?: string; hasIssues?: boolean }) {
  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  if (options?.workflowId !== undefined) params.set("workflow_id", options.workflowId);
  if (options?.hasIssues) params.set("has_issues", "true");
  const qs = params.toString();

  return useQuery({
    queryKey: ["executions", options?.status ?? "all", options?.workflowId ?? "all", options?.hasIssues ?? false],
    queryFn: () => api.get<Execution[]>(`/executions${qs ? `?${qs}` : ""}`),
    refetchInterval: 3000,
  });
}

export function useExecutionStats() {
  return useQuery({
    queryKey: ["executions", "stats"],
    queryFn: () => api.get<ExecutionStats>("/executions/stats"),
    refetchInterval: 10000,
  });
}

export function useUnseenIssuesCount() {
  return useQuery({
    queryKey: ["executions", "unseen-issues-count"],
    queryFn: () => api.get<{ count: number }>("/executions/unseen-issues-count"),
    refetchInterval: 5000,
  });
}

export function useExecution(id: string | undefined) {
  return useQuery({
    queryKey: ["executions", "detail", id],
    queryFn: () => api.get<ExecutionDetail>(`/executions/${id}`),
    enabled: id !== undefined,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && TERMINAL_STATUSES.includes(status) ? false : 2000;
    },
  });
}

// se llama solo cuando el usuario abre una ejecución que YA estaba terminada al
// momento de entrar (desde Revisión o el historial de Workflows) - no automáticamente
// mientras mira una ejecución recién disparada terminar en vivo, para que el badge de
// notificaciones en Revisión siga reflejando que hay algo pendiente de revisar
export function useMarkExecutionSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (executionId: string) => api.post<Execution>(`/executions/${executionId}/mark-seen`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["executions"] }),
  });
}

export function useCreateExecution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, workflowId }: { documentId: string; workflowId?: string }) =>
      api.post<Execution>("/executions", { document_id: documentId, workflow_id: workflowId ?? null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["executions"] }),
  });
}

export function useResolveMappedField(executionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      fieldId,
      correctedValue,
      role,
    }: {
      fieldId: string;
      correctedValue: string | null;
      role: string;
    }) =>
      api.post<MappedField>(`/executions/${executionId}/mapped-fields/${fieldId}/resolve`, {
        corrected_value: correctedValue,
        role,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["executions", "detail", executionId] });
      qc.invalidateQueries({ queryKey: ["executions"] });
    },
  });
}
