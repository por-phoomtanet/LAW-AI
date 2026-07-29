import { create } from "zustand";
import type { ConversationSummary, ChatMessage, Citation } from "@/modules/chat/types";

// ไม่ persist — DB เป็น source of truth เสมอ (เลี่ยงบั๊กแบบ stale-localStorage-JWT ที่เคยเจอ)
interface ChatState {
  conversations: ConversationSummary[];
  activeConversationId: number | null;
  messages: ChatMessage[];
  streamingBuffer: string;
  isStreaming: boolean;
  setConversations: (conversations: ConversationSummary[]) => void;
  upsertConversation: (conversation: ConversationSummary) => void;
  removeConversation: (id: number) => void;
  setActiveConversation: (id: number | null) => void;
  setMessages: (messages: ChatMessage[]) => void;
  appendUserMessage: (content: string) => void;
  appendStreamingDelta: (delta: string) => void;
  commitStreamingMessage: (citations?: Citation[]) => void;
  resetStreamingBuffer: () => void;
  setIsStreaming: (isStreaming: boolean) => void;
}

let tempIdCounter = -1;

export const useChatStore = create<ChatState>()((set) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  streamingBuffer: "",
  isStreaming: false,

  setConversations: (conversations) => set({ conversations }),

  upsertConversation: (conversation) =>
    set((state) => {
      const exists = state.conversations.some((c) => c.id === conversation.id);
      const next = exists
        ? state.conversations.map((c) => (c.id === conversation.id ? conversation : c))
        : [conversation, ...state.conversations];
      next.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return { conversations: next };
    }),

  removeConversation: (id) =>
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
      activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
      messages: state.activeConversationId === id ? [] : state.messages,
    })),

  setActiveConversation: (id) => set({ activeConversationId: id }),

  setMessages: (messages) => set({ messages }),

  appendUserMessage: (content) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: tempIdCounter--,
          role: "user",
          content,
          modelUsed: null,
          createdAt: new Date().toISOString(),
        },
      ],
    })),

  appendStreamingDelta: (delta) =>
    set((state) => ({ streamingBuffer: state.streamingBuffer + delta })),

  commitStreamingMessage: (citations) =>
    set((state) =>
      state.streamingBuffer
        ? {
            messages: [
              ...state.messages,
              {
                id: tempIdCounter--,
                role: "assistant",
                content: state.streamingBuffer,
                modelUsed: null,
                citations: citations ?? null,
                createdAt: new Date().toISOString(),
              },
            ],
            streamingBuffer: "",
          }
        : { streamingBuffer: "" },
    ),

  resetStreamingBuffer: () => set({ streamingBuffer: "" }),

  setIsStreaming: (isStreaming) => set({ isStreaming }),
}));
