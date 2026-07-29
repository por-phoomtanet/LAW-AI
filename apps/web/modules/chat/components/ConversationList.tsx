import type { ConversationSummary } from "../types";

export default function ConversationList({
  conversations,
  activeId,
  loading,
  onSelect,
}: {
  conversations: ConversationSummary[];
  activeId: number | null;
  loading: boolean;
  onSelect: (id: number) => void;
}) {
  if (loading) {
    return <div className="text-sm text-gray-500">กำลังโหลด...</div>;
  }

  if (conversations.length === 0) {
    return <div className="text-sm text-gray-500">ยังไม่มีบทสนทนา</div>;
  }

  return (
    <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
      {conversations.map((conversation) => (
        <button
          key={conversation.id}
          type="button"
          onClick={() => onSelect(conversation.id)}
          className={`truncate rounded-lg px-3 py-2 text-left text-sm transition-colors ${
            conversation.id === activeId
              ? "bg-white/10 text-gray-100"
              : "text-gray-400 hover:bg-white/5 hover:text-gray-100"
          }`}
        >
          {conversation.title ?? "บทสนทนาใหม่"}
        </button>
      ))}
    </div>
  );
}
