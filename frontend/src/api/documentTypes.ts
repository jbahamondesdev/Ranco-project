import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { DocumentType, DocumentTypeDetail, FieldDefinition, DocumentTypeVersion } from "./types";

export function useDocumentTypes() {
  return useQuery({
    queryKey: ["document-types"],
    queryFn: () => api.get<DocumentType[]>("/document-types"),
  });
}

export function useDocumentType(id: string | undefined) {
  return useQuery({
    queryKey: ["document-types", id],
    queryFn: () => api.get<DocumentTypeDetail>(`/document-types/${id}`),
    enabled: id !== undefined,
  });
}

export function useCreateDocumentType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string }) => api.post<DocumentType>("/document-types", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["document-types"] }),
  });
}

export function useUpdateDocumentType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ documentTypeId, name }: { documentTypeId: string; name: string }) =>
      api.patch<DocumentType>(`/document-types/${documentTypeId}`, { name }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["document-types", vars.documentTypeId] });
      qc.invalidateQueries({ queryKey: ["document-types"] });
    },
  });
}

export function useDeleteDocumentType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentTypeId: string) => api.del<void>(`/document-types/${documentTypeId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["document-types"] }),
  });
}

export function useCreateVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      documentTypeId,
      fields_schema,
      reference_document_id,
    }: {
      documentTypeId: string;
      fields_schema: FieldDefinition[];
      reference_document_id?: string | null;
    }) =>
      api.post<DocumentTypeVersion>(`/document-types/${documentTypeId}/versions`, {
        fields_schema,
        reference_document_id: reference_document_id ?? null,
      }),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ["document-types", vars.documentTypeId] }),
  });
}

export function usePublishVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ documentTypeId, versionId }: { documentTypeId: string; versionId: string }) =>
      api.post<DocumentTypeVersion>(
        `/document-types/${documentTypeId}/versions/${versionId}/publish`
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["document-types", vars.documentTypeId] });
      qc.invalidateQueries({ queryKey: ["document-types"] });
    },
  });
}
