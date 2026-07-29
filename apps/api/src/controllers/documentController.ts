import { documentService } from "../services/library/documentService";

export const documentController = {
  async list({ query }: { query: { docType?: string } }) {
    const data = await documentService.list(query.docType);
    return { data };
  },

  async get({ params }: { params: { id: string } }) {
    const data = await documentService.getDetail(Number(params.id));
    return { data };
  },
};
