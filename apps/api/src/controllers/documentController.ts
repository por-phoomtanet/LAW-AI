import { documentService } from "../services/library/documentService";

export const documentController = {
  async list({ query }: { query: { docType?: string } }) {
    const data = await documentService.list(query.docType);
    return { data };
  },

  async get({ params, query }: { params: { id: string }; query: { versionId?: string } }) {
    const versionId = query.versionId ? Number(query.versionId) : undefined;
    const data = await documentService.getDetail(Number(params.id), versionId);
    return { data };
  },
};
