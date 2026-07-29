export type LawCategory = "primary" | "subordinate";

export interface DocumentSummary {
  id: number;
  lawCode: string;
  title: string;
  docType: string;
  citationCode: string | null;
}

export interface CategoryCount {
  category: LawCategory;
  label: string;
  count: number;
}

export interface DocTypeCount {
  docType: string;
  category: LawCategory;
  count: number;
}

export interface DocumentListResponse {
  categories: CategoryCount[];
  docTypes: DocTypeCount[];
  documents: DocumentSummary[];
}

export interface TocNode {
  id: number;
  sectionType: string;
  sectionNumber: string | null;
  content: string;
  children: TocNode[];
}

export interface DocumentDetail {
  id: number;
  lawCode: string;
  title: string;
  docType: string;
  citationCode: string | null;
  version: {
    id: number;
    versionLabel: string;
    sourceUrl: string | null;
    effectiveFrom: string | null;
  };
  toc: TocNode[];
}
