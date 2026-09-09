import { useMutation } from "@tanstack/react-query";
import { api } from "./client";
import type { ChatMessage, DocumentChatResponse, SuggestedField } from "./types";

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
