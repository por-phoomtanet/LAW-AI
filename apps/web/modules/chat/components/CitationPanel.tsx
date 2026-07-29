"use client";

import { useRef, useState } from "react";
import type { Citation } from "../types";

function CitationCard({
  citation,
  highlighted,
  cardRef,
  onClick,
}: {
  citation: Citation;
  highlighted: boolean;
  cardRef: (el: HTMLDivElement | null) => void;
  onClick: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      id={`citation-${citation.index}`}
      ref={cardRef}
      className={`rounded-2xl border p-3 transition-colors ${
        highlighted ? "border-blue-400/50 bg-blue-500/10" : "border-white/10 bg-[#1e1f20]"
      }`}
    >
      <button
        type="button"
        onClick={() => {
          onClick();
          setExpanded((current) => !current);
        }}
        className="flex w-full items-start gap-2 text-left"
      >
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-medium text-blue-300">
          {citation.index}
        </span>
        <span className="text-sm font-medium text-gray-100">{citation.citationLabel}</span>
      </button>
      {expanded && (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-400">
          {citation.content}
        </p>
      )}
    </div>
  );
}

// แผงอ้างอิงด้านขวา — โชว์ citation ของข้อความ assistant ล่าสุดที่มี citations (ไม่ใช่ทุกข้อความ
// ในบทสนทนา เพื่อไม่ให้รกเกินไป) คลิกเลข [n] ในเนื้อความ (ผ่าน MarkdownMessage's onCitationClick)
// จะ scrollIntoView + highlight + expand การ์ดที่ตรงกันที่นี่
export default function CitationPanel({ citations }: { citations: Citation[] }) {
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const cardRefs = useRef(new Map<number, HTMLDivElement>());

  function scrollToCitation(index: number) {
    cardRefs.current.get(index)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlighted(index);
    setTimeout(() => setHighlighted((current) => (current === index ? null : current)), 1500);
  }

  if (citations.length === 0) return null;

  return (
    <div className="flex h-full w-80 shrink-0 flex-col overflow-y-auto border-l border-white/10 pl-4">
      <h2 className="mb-3 text-sm font-medium text-gray-400">แหล่งอ้างอิงคำตอบ</h2>
      <div className="flex flex-col gap-2">
        {citations.map((citation) => (
          <CitationCard
            key={citation.index}
            citation={citation}
            highlighted={highlighted === citation.index}
            cardRef={(el) => {
              if (el) cardRefs.current.set(citation.index, el);
            }}
            onClick={() => scrollToCitation(citation.index)}
          />
        ))}
      </div>
    </div>
  );
}
