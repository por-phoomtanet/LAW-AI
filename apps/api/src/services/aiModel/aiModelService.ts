import { aiModelRepository } from "../../repositories/aiModelRepository";

export const aiModelService = {
  list() {
    return aiModelRepository.findManyActive();
  },
};
