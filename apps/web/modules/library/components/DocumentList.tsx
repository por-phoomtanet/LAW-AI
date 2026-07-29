"use client";

import { List } from "antd";
import type { DocumentSummary } from "../types";

export default function DocumentList({
  documents,
  loading,
  selectedId,
  onSelect,
}: {
  documents: DocumentSummary[];
  loading: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <List
      loading={loading}
      dataSource={documents}
      locale={{ emptyText: "ไม่พบเอกสาร" }}
      renderItem={(doc) => (
        <List.Item
          onClick={() => onSelect(doc.id)}
          className={`cursor-pointer rounded px-3 ${doc.id === selectedId ? "bg-blue-50" : "hover:bg-gray-50"}`}
        >
          <List.Item.Meta title={doc.title} description={doc.docType} />
        </List.Item>
      )}
    />
  );
}
