export type ConversationMode = "general" | "legal";

export interface AiModelOption {
  modelId: string;
  label: string;
}

export interface Citation {
  index: number;
  passageId: number;
  documentId: number;
  citationLabel: string;
  content: string;
}

export interface ConversationSummary {
  id: number;
  title: string | null;
  modelTier: string;
  mode: ConversationMode;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  modelUsed: string | null;
  citations?: Citation[] | null;
  createdAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ChatMessage[];
}
