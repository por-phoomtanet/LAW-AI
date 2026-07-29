"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="group relative my-3 overflow-x-auto rounded-2xl border border-white/10 bg-[#1e1f20] p-4">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-3 top-3 rounded-md px-2 py-1 text-xs text-gray-400 opacity-0 transition-opacity hover:bg-white/10 hover:text-gray-100 group-hover:opacity-100"
      >
        {copied ? "คัดลอกแล้ว" : "คัดลอก"}
      </button>
      <pre className="whitespace-pre pr-16 text-sm text-gray-100">
        <code>{children}</code>
      </pre>
    </div>
  );
}

// code ที่ไม่มี "\n" ถือเป็น inline (markdown ไม่รองรับ inline code span หลายบรรทัดอยู่แล้ว)
// react-markdown v9+ ไม่ส่ง prop "inline" มาให้แยกแบบเดิม — ใช้ heuristic นี้แทน
function isBlockCode(className: string | undefined, content: string) {
  return Boolean(className?.includes("language-")) || content.includes("\n");
}

const components: Components = {
  h1: ({ children }) => <h1 className="mb-2 mt-4 text-xl font-bold text-gray-100">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-4 text-lg font-bold text-gray-100">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-3 text-base font-bold text-gray-100">{children}</h3>,
  p: ({ children }) => <p className="mb-3 leading-relaxed text-gray-100 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="mb-3 ml-5 list-disc space-y-1.5 text-gray-100">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 ml-5 list-decimal space-y-1.5 text-gray-100">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  hr: () => <hr className="my-4 border-white/10" />,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-blue-400 underline">
      {children}
    </a>
  ),
  // react-markdown ห่อ code แบบ block ไว้ใน pre เสมอ — ให้ pre เป็นแค่ passthrough
  // แล้วให้ CodeBlock (เรียกจาก code override ด้านล่าง) เป็นคนคุม wrapper เองทั้งหมด
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const content = String(children).replace(/\n$/, "");
    if (isBlockCode(className, content)) {
      return <CodeBlock>{content}</CodeBlock>;
    }
    return (
      <code className="rounded bg-white/10 px-1.5 py-0.5 text-sm text-gray-100">{content}</code>
    );
  },
};

export default function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
