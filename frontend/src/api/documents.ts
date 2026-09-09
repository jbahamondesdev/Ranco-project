import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, BASE_URL } from "./client";
import type { DocumentItem } from "./types";

export function getDocumentFileUrl(documentId: string): string {
  return `${BASE_URL}/documents/${documentId}/file`;
}

export function useDocument(id: string | undefined) {
  return useQuery({
    queryKey: ["documents", id],
    queryFn: () => api.get<DocumentItem>(`/documents/${id}`),
    enabled: id !== undefined,
  });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.post<DocumentItem>("/documents", form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
}
