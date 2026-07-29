"use client";

import { useRef } from "react";
import { Tree, Typography, Empty } from "antd";
import type { DataNode } from "antd/es/tree";
import type { DocumentDetail as DocumentDetailType, TocNode } from "../types";

const { Title, Paragraph, Text } = Typography;

function toTreeData(nodes: TocNode[]): DataNode[] {
  return nodes.map((node) => ({
    key: node.id,
    title:
      node.sectionType === "section"
        ? `มาตรา ${node.sectionNumber ?? ""}`
        : node.content.slice(0, 40) || node.sectionType,
    children: node.children.length ? toTreeData(node.children) : undefined,
  }));
}

// เรียงเนื้อหาทั้งเอกสารเป็น flat list ตามลำดับ (depth-first เดียวกับที่ TOC แสดง)
// เพื่อ render เป็นเนื้อหาต่อเนื่องยาวเดียว — คลิก TOC แล้วเลื่อนไปหา anchor แทนการ
// โชว์แค่มาตราเดียวแบบแยก panel
function flattenInOrder(nodes: TocNode[]): TocNode[] {
  const result: TocNode[] = [];
  for (const node of nodes) {
    result.push(node);
    result.push(...flattenInOrder(node.children));
  }
  return result;
}

export default function DocumentDetail({ document }: { document: DocumentDetailType | null }) {
  const contentRefs = useRef(new Map<number, HTMLDivElement>());

  if (!document) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty description="เลือกเอกสารทางซ้ายเพื่อดูรายละเอียด" />
      </div>
    );
  }

  const flatPassages = flattenInOrder(document.toc);

  return (
    <div className="flex h-full gap-4">
      <div className="w-64 shrink-0 overflow-y-auto border-r pr-3">
        <Tree
          treeData={toTreeData(document.toc)}
          defaultExpandAll
          onSelect={(keys) => {
            const key = keys[0] as number | undefined;
            if (key != null) {
              contentRefs.current.get(key)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }}
        />
      </div>
      <div className="flex-1 overflow-y-auto pr-2">
        <Title level={4}>{document.title}</Title>
        <Text type="secondary">{document.version.versionLabel}</Text>
        {document.version.sourceUrl && (
          <Paragraph>
            <a href={document.version.sourceUrl} target="_blank" rel="noreferrer">
              ดูต้นฉบับ
            </a>
          </Paragraph>
        )}
        <div className="mt-4 flex flex-col gap-3">
          {flatPassages.map((passage) => (
            <div
              key={passage.id}
              ref={(el) => {
                if (el) contentRefs.current.set(passage.id, el);
              }}
            >
              {passage.sectionType === "chapter" || passage.sectionType === "part" ? (
                <Title level={5}>{passage.content}</Title>
              ) : (
                <Paragraph className="whitespace-pre-wrap">{passage.content}</Paragraph>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
