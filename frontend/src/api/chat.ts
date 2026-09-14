import { useMutation } from "@tanstack/react-query";
import { api } from "./client";
import type {
  ChatMessage,
  DocumentChatResponse,
  FieldDefinition,
  PreviewExtractionResponse,
  SuggestedField,
} from "./types";

export function useDocumentChat() {
  return useMutation({
    mutationFn: ({
      documentId,
      messages,
      currentFields,
    }: {
      documentId: string;
      messages: ChatMessage[];
      currentFields: SuggestedField[];
    }) =>
      api.post<DocumentChatResponse>(`/documents/${documentId}/chat`, {
        messages,
        current_fields: currentFields,
      }),
  });
}

export function usePreviewExtraction() {
  return useMutation({
    mutationFn: ({ documentId, fieldsSchema }: { documentId: string; fieldsSchema: FieldDefinition[] }) =>
      api.post<PreviewExtractionResponse>(`/documents/${documentId}/preview-extraction`, {
        fields_schema: fieldsSchema,
      }),
  });
}
