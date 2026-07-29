import type { Conversation, Prisma } from "@law-ai/db";
import { conversationService } from "../services/chat/conversationService";
import type { JwtPayload } from "../types/auth";

type ConversationWithMessages = Prisma.ConversationGetPayload<{ include: { messages: true } }>;

function toSummary(conversation: Conversation) {
  return {
    id: conversation.id,
    title: conversation.title,
    modelTier: conversation.modelTier,
    mode: conversation.mode,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

function toDetail(conversation: ConversationWithMessages) {
  return {
    ...toSummary(conversation),
    messages: conversation.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      modelUsed: message.modelUsed,
      citations: message.citations,
      createdAt: message.createdAt,
    })),
  };
}

export const conversationController = {
  async list({ user }: { user: JwtPayload }) {
    const conversations = await conversationService.list(user.userId);
    return { data: conversations.map(toSummary) };
  },

  async create({ user, body }: { user: JwtPayload; body?: { modelId?: string; mode?: string } }) {
    const conversation = await conversationService.create(user.userId, body?.modelId, body?.mode);
    return { data: toSummary(conversation) };
  },

  async get({ params, user }: { params: { id: string }; user: JwtPayload }) {
    const conversation = await conversationService.getWithMessages(Number(params.id), user.userId);
    return { data: toDetail(conversation) };
  },

  async remove({ params, user }: { params: { id: string }; user: JwtPayload }) {
    await conversationService.remove(Number(params.id), user.userId);
    return { data: { id: Number(params.id) } };
  },
};
