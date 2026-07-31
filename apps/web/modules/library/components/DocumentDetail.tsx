"use client";

import { useRef } from "react";
import { Tree, Typography, Empty } from "antd";
import type { DataNode } from "antd/es/tree";
import type { DocumentDetail as DocumentDetailType, TocNode, VersionSummary } from "../types";

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

function formatYear(dateStr: string | null): number | null {
  return dateStr ? new Date(dateStr).getFullYear() : null;
}

// tab bar เลือกเวอร์ชัน — เทียบ fourcorners.law: ปุ่มเลข 1,2,3... เรียงเก่า→ใหม่ (versions มาจาก
// backend เรียง effectiveFrom asc แล้ว) ตัวที่เลือกอยู่ไฮไลต์สีส้ม เอกสารมีเวอร์ชันเดียวไม่ต้องโชว์
function VersionTabBar({
  versions,
  activeVersionId,
  onSelectVersion,
}: {
  versions: VersionSummary[];
  activeVersionId: number;
  onSelectVersion: (versionId: number) => void;
}) {
  if (versions.length <= 1) return null;

  const activeIndex = versions.findIndex((v) => v.id === activeVersionId);
  const activeVersion = versions[activeIndex];
  const firstYear = formatYear(versions[0].effectiveFrom);
  const lastYear = formatYear(versions[versions.length - 1].effectiveFrom);
  const spanYears =
    firstYear != null && lastYear != null ? Math.max(1, lastYear - firstYear) : null;

  return (
    <div className="mb-3 flex items-center gap-3 border-b pb-3">
      <div className="flex flex-1 gap-1 overflow-x-auto">
        {versions.map((v, i) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onSelectVersion(v.id)}
            className={`shrink-0 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              v.id === activeVersionId
                ? "bg-orange-500 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="shrink-0 text-right text-sm text-gray-500">
        <div>
          ฉบับที่ {activeIndex + 1}
          {activeVersion?.isLatest ? " (ปัจจุบัน)" : ""}
        </div>
        <div>
          {versions.length} เวอร์ชัน{spanYears != null ? ` · ${spanYears} ปี` : ""}
        </div>
      </div>
    </div>
  );
}

export default function DocumentDetail({
  document,
  onSelectVersion,
}: {
  document: DocumentDetailType | null;
  // ไม่บังคับส่งมา (เผื่อจุดใช้งานอื่นในอนาคตที่ไม่ต้องการให้เปลี่ยนเวอร์ชันได้) — ไม่ส่งมา = ไม่โชว์ tab bar
  onSelectVersion?: (versionId: number) => void;
}) {
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
    <div className="flex h-full flex-col">
      {onSelectVersion && (
        <VersionTabBar
          versions={document.versions}
          activeVersionId={document.version.id}
          onSelectVersion={onSelectVersion}
        />
      )}
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="w-64 shrink-0 overflow-y-auto border-r pr-3">
          <Tree
            treeData={toTreeData(document.toc)}
            defaultExpandAll
            onSelect={(keys) => {
              const key = keys[0] as number | undefined;
              if (key != null) {
                contentRefs.current
                  .get(key)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    </div>
  );
}
