"use client";

import { Tree } from "antd";
import type { CategoryCount, DocTypeCount } from "../types";

export default function CategorySidebar({
  categories,
  docTypes,
  selectedDocType,
  onSelectDocType,
}: {
  categories: CategoryCount[];
  docTypes: DocTypeCount[];
  selectedDocType: string | null;
  onSelectDocType: (docType: string | null) => void;
}) {
  const treeData = categories
    .filter((category) => category.count > 0)
    .map((category) => ({
      key: `category:${category.category}`,
      title: `${category.label} (${category.count})`,
      selectable: false,
      children: docTypes
        .filter((d) => d.category === category.category)
        .map((d) => ({
          key: d.docType,
          title: `${d.docType} (${d.count})`,
        })),
    }));

  return (
    <Tree
      treeData={treeData}
      defaultExpandAll
      selectedKeys={selectedDocType ? [selectedDocType] : []}
      onSelect={(keys) => {
        const key = keys[0] as string | undefined;
        if (!key || key.startsWith("category:")) return;
        onSelectDocType(key === selectedDocType ? null : key);
      }}
    />
  );
}
