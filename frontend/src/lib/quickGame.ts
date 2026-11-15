import { newDraft } from "../components/OutcomeEditor.tsx";
import { DEFAULT_SETTINGS } from "./rules.ts";
import type { BetDraft, Settings } from "./types.ts";

import { QUICK_TEMPLATES, type QuickTemplate } from "../../../shared/gameTemplates.ts";
export { QUICK_TEMPLATES, type QuickTemplate };

export const quickSettings = (questionCount: number): Settings => ({
  ...DEFAULT_SETTINGS, betCount: questionCount, mode: "pool", favorsPerPlayer: 2,
  betCreation: "upfront", hostPlays: true,
});

export const templateDrafts = (template: QuickTemplate): BetDraft[] => template.questions.slice(0, 3).map((question) => {
  const draft = newDraft(question);
  if (template.id === "keep-it-clean") {
    draft.kind = "multi";
    draft.outcomes = Array.from({ length: 5 }, (_, i) => ({ label: `Person ${i + 1}` }));
  }
  return draft;
});
