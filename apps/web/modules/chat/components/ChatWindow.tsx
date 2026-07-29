"use client";

import { useEffect, useState } from "react";
import { Drawer } from "antd";
import { chatApi } from "../services/chatApi";
import { useChatStream } from "../hooks/useChatStream";
import { useChatStore } from "@/store/chatStore";
import ConversationList from "./ConversationList";
import MessageThread from "./MessageThread";
import ChatInput from "./ChatInput";

export default function ChatWindow() {
  const [loadingList, setLoadingList] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const setConversations = useChatStore((state) => state.setConversations);
  const upsertConversation = useChatStore((state) => state.upsertConversation);
  const setActiveConversation = useChatStore((state) => state.setActiveConversation);
  const setMessages = useChatStore((state) => state.setMessages);
  const appendUserMessage = useChatStore((state) => state.appendUserMessage);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const { send, error } = useChatStream();

  useEffect(() => {
    chatApi
      .list()
      .then(setConversations)
      .finally(() => setLoadingList(false));
  }, [setConversations]);

  async function handleSelectConversation(id: number) {
    setActiveConversation(id);
    setDrawerOpen(false);
    const detail = await chatApi.get(id);
    setMessages(detail.messages);
  }

  function handleNewConversation() {
    setActiveConversation(null);
    setMessages([]);
    setDrawerOpen(false);
  }

  async function handleSend(content: string) {
    let conversationId = activeConversationId;
    // ยังไม่มีบทสนทนาที่เลือกอยู่ (ข้อความแรกสุด) → สร้าง conversation ก่อน แล้วค่อยส่ง path เดียวกับข้อความถัดๆ ไป
    if (!conversationId) {
      const conversation = await chatApi.create();
      upsertConversation(conversation);
      setActiveConversation(conversation.id);
      conversationId = conversation.id;
    }

    appendUserMessage(content);
    await send(conversationId, content);

    const updated = await chatApi.get(conversationId);
    upsertConversation({
      id: updated.id,
      title: updated.title,
      modelTier: updated.modelTier,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  }

  const conversationListPanel = (
    <>
      <button
        type="button"
        onClick={handleNewConversation}
        className="mb-3 w-full rounded-full border border-white/10 py-2 text-sm text-gray-100 transition-colors hover:bg-white/5"
      >
        + บทสนทนาใหม่
      </button>
      <ConversationList
        conversations={conversations}
        activeId={activeConversationId}
        loading={loadingList}
        onSelect={handleSelectConversation}
      />
    </>
  );

  return (
    // -m-6 ยกเลิก p-6 ของ Content (DashboardLayout) เฉพาะหน้านี้ — ให้ panel ชนขอบเต็มพื้นที่
    // แบบ NotebookLM จริงๆ ไม่ลอยเป็นการ์ดมีขอบขาวรอบ ๆ (หน้าอื่นใน dashboard ยังใช้ padding ปกติ)
    <div className="-m-6 flex h-screen gap-4 bg-[#131314] p-4">
      <div className="hidden md:flex md:w-72 md:shrink-0 md:flex-col md:border-r md:border-white/10 md:pr-4">
        {conversationListPanel}
      </div>

      <Drawer
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={<span className="text-gray-100">บทสนทนา</span>}
        width={280}
        closeIcon={<span className="text-gray-100">×</span>}
        styles={{
          header: { background: "#1e1f20", borderBottom: "1px solid rgba(255,255,255,0.1)" },
          body: { background: "#131314" },
          content: { background: "#131314" },
          mask: { background: "rgba(0,0,0,0.6)" },
        }}
      >
        {conversationListPanel}
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-1 flex items-center justify-between md:mb-2">
          <h1 className="text-lg font-medium text-gray-100">แชท</h1>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="text-gray-400 transition-colors hover:text-gray-100 md:hidden"
          >
            ☰
          </button>
        </div>
        <MessageThread />
        {error && <div className="px-2 pb-2 text-sm text-red-400">{error}</div>}
        <ChatInput onSend={handleSend} disabled={isStreaming} />
      </div>
    </div>
  );
}
