"use client";

import { useEffect, useState } from "react";
import { Drawer } from "antd";
import { chatApi } from "../services/chatApi";
import { useChatStream } from "../hooks/useChatStream";
import { useChatStore } from "@/store/chatStore";
import ConversationList from "./ConversationList";
import MessageThread from "./MessageThread";
import ChatInput from "./ChatInput";
import ModelSelect from "./ModelSelect";
import CitationPanel from "./CitationPanel";

// เกือบเหมือน ChatWindow.tsx (Phase 3.4) ทุกอย่าง — ต่างกันแค่ mode="legal" ตอนสร้างบทสนทนา,
// filter conversation list เอาเฉพาะ mode="legal", และมีแผงอ้างอิงด้านขวา (CitationPanel)
// ไม่แก้ ChatWindow.tsx เลยตามที่ตกลงไว้ใน Phase 5 — ไฟล์นี้เป็นของใหม่แยกต่างหาก
export default function LegalChatWindow() {
  const [loadingList, setLoadingList] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const messages = useChatStore((state) => state.messages);
  const setConversations = useChatStore((state) => state.setConversations);
  const upsertConversation = useChatStore((state) => state.upsertConversation);
  const setActiveConversation = useChatStore((state) => state.setActiveConversation);
  const setMessages = useChatStore((state) => state.setMessages);
  const appendUserMessage = useChatStore((state) => state.appendUserMessage);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const { send, error } = useChatStream();

  // chatStore เป็น global store เดียวใช้ร่วมกับแชททั่วไป (ChatWindow) — filter เอาเฉพาะ
  // mode="legal" ไม่งั้นสลับหน้าไปมาจะเห็นบทสนทนาปนกัน (ดูเหตุผลเดียวกันใน ChatWindow.tsx)
  useEffect(() => {
    chatApi
      .list()
      .then((all) => {
        const legal = all.filter((c) => c.mode === "legal");
        setConversations(legal);
        if (activeConversationId != null && !legal.some((c) => c.id === activeConversationId)) {
          setActiveConversation(null);
          setMessages([]);
        }
      })
      .finally(() => setLoadingList(false));
  }, []);

  async function handleSelectConversation(id: number) {
    setActiveConversation(id);
    setDrawerOpen(false);
    const detail = await chatApi.get(id);
    setMessages(detail.messages);
  }

  function handleNewConversation() {
    setActiveConversation(null);
    setMessages([]);
    setSelectedModelId(null);
    setDrawerOpen(false);
  }

  async function handleSend(content: string) {
    let conversationId = activeConversationId;
    if (!conversationId) {
      const conversation = await chatApi.create(selectedModelId ?? undefined, "legal");
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
      mode: updated.mode,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  }

  function handleCitationClick(index: number) {
    document
      .getElementById(`citation-${index}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // แผงอ้างอิงโชว์ citations ของข้อความ assistant "ล่าสุด" ที่มี citations เท่านั้น
  // (ไม่ใช่รวมทุกข้อความในบทสนทนา — จะรกเกินไปและไม่ตรงกับคำถามล่าสุดที่ผู้ใช้สนใจ)
  const latestCitations = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.citations && m.citations.length > 0)?.citations;

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
          <h1 className="text-lg font-medium text-gray-100">แชทกฎหมาย</h1>
          <div className="flex items-center gap-2">
            {activeConversationId == null && (
              <ModelSelect value={selectedModelId} onChange={setSelectedModelId} />
            )}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="text-gray-400 transition-colors hover:text-gray-100 md:hidden"
            >
              ☰
            </button>
          </div>
        </div>
        <MessageThread
          onCitationClick={handleCitationClick}
          emptyTitle="แชทกฎหมาย"
          emptyDescription="ถามคำถามเกี่ยวกับตัวบทกฎหมายไทย — คำตอบจะอ้างอิงจากคลังกฎหมายพร้อมเลขอ้างอิงที่ตรวจสอบย้อนกลับได้"
        />
        {error && <div className="px-2 pb-2 text-sm text-red-400">{error}</div>}
        <ChatInput onSend={handleSend} disabled={isStreaming} />
      </div>

      {latestCitations && latestCitations.length > 0 && (
        <CitationPanel citations={latestCitations} />
      )}
    </div>
  );
}
