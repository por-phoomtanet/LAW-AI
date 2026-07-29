"use client";

import { useEffect, useState } from "react";
import { Spin } from "antd";
import { libraryApi } from "../services/libraryApi";
import type { DocumentListResponse, DocumentDetail as DocumentDetailType } from "../types";
import CategorySidebar from "./CategorySidebar";
import DocumentList from "./DocumentList";
import DocumentDetail from "./DocumentDetail";

export default function LibraryPageContent() {
  const [listData, setListData] = useState<DocumentListResponse | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedDocType, setSelectedDocType] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DocumentDetailType | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    setLoadingList(true);
    libraryApi
      .list(selectedDocType ?? undefined)
      .then(setListData)
      .finally(() => setLoadingList(false));
  }, [selectedDocType]);

  useEffect(() => {
    if (selectedId == null) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    libraryApi
      .get(selectedId)
      .then(setDetail)
      .finally(() => setLoadingDetail(false));
  }, [selectedId]);

  return (
    <div className="flex h-[calc(100vh-6rem)] gap-4">
      <div className="w-56 shrink-0 overflow-y-auto border-r pr-3">
        {listData && (
          <CategorySidebar
            categories={listData.categories}
            docTypes={listData.docTypes}
            selectedDocType={selectedDocType}
            onSelectDocType={setSelectedDocType}
          />
        )}
      </div>
      <div className="w-80 shrink-0 overflow-y-auto border-r pr-3">
        {listData && (
          <DocumentList
            documents={listData.documents}
            loading={loadingList}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        {loadingDetail ? (
          <div className="flex h-full items-center justify-center">
            <Spin />
          </div>
        ) : (
          <DocumentDetail document={detail} />
        )}
      </div>
    </div>
  );
}
