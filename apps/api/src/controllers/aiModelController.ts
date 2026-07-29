import type { AiModel } from "@law-ai/db";
import { aiModelService } from "../services/aiModel/aiModelService";

function toSummary(model: AiModel) {
  return { modelId: model.modelId, label: model.label };
}

export const aiModelController = {
  async list() {
    const models = await aiModelService.list();
    return { data: models.map(toSummary) };
  },
};
