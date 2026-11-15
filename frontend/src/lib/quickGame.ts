import { newDraft } from "../components/OutcomeEditor.tsx";
import { DEFAULT_SETTINGS } from "./rules.ts";
import type { BetDraft, Settings } from "./types.ts";

export type QuickTemplate = {
  id: string;
  category: "game" | "weekend" | "roommate" | "group";
  label: string;
  name: string;
  description: string;
  questions: string[];
  punishments: string[];
};

const shared = [
  "Do an impression of an animal the group picks in voice chat",
  "Use a Discord display name chosen by the group for the day",
  "Sing the chorus of a song the group picks",
  "Let the group pick your Discord profile picture for the day",
  "Bring snacks to the next game night",
];

const game = (id: string, label: string, questions: string[], punishments = shared): QuickTemplate => ({
  id, category: "game", label, name: id === "other" ? "Game night" : `${label} game night`,
  description: id === "other" ? "Predictions for our next game session." : `Predictions for our next ${label} session.`, questions, punishments,
});

export const QUICK_TEMPLATES: QuickTemplate[] = [
  game("valorant", "Valorant", ["Will anyone get an ace next match?", "Will anyone win a 1v2 clutch?", "Will we win an attacker-side post-plant after the spike timer reaches five seconds?", "Will anyone get a kill through smoke?", "Will anyone drop a 3K in one round?", "Will anyone get a wallbang kill?"]),
  game("league", "League of Legends", ["Will anyone get a double kill before 10 minutes?", "Will either team steal Baron or dragon?", "Will anyone get a triple kill?", "Will a support get a solo kill before 10 minutes?", "Will the first tower fall before 10 minutes?"]),
  game("cs2", "Counter-Strike 2", ["Will anyone get an ace next match?", "Will anyone win a 1v2 clutch?", "Will anyone win a 1v3 clutch?", "Will anyone get a wallbang kill?", "Will anyone get a no-scope AWP kill?", "Will anyone get a smoke kill?"]),
  game("overwatch", "Overwatch 2", ["Will anyone in our group get Play of the Game?", "Will anyone get a boop kill?", "Will our team get a team kill?", "Will anyone get a 3K during one ult?", "Will a support get Play of the Game?"]),
  game("apex", "Apex Legends", ["Will anyone in our squad get a squad wipe?", "Will we find gold loot before ring one closes?", "Will anyone get five or more kills in one match?", "Will a care package land inside the first ring?", "Will anyone get a knock from 100+ meters?"]),
  game("fortnite", "Fortnite", ["Will we find legendary loot before the first storm closes?", "Will anyone get a 100+ meter elimination?", "Will we spot a loot llama in our first match?", "Will anyone get three eliminations with three different weapons?", "Will our squad open a supply drop?"]),
  game("rocket-league", "Rocket League", ["Will anyone score a hat trick next match?", "Will anyone score a kickoff goal?", "Will anyone score a buzzer beater?", "Will we score within five seconds of a demo?", "Will anyone score from their own half?"]),
  game("minecraft", "Minecraft", ["Will we find diamonds during this session?", "Will anyone find a village before we find diamonds?", "Will anyone find a mineshaft?", "Will anyone find an enchanted book while exploring?", "Will we encounter a naturally spawned spider jockey?"]),
  game("mario-kart", "Mario Kart", ["Will a blue shell hit first place on the final lap?", "Will a blue shell and lightning both appear in the same race?", "Will anyone dodge a blue shell with an item?", "Will two racers finish within one second of each other?", "Will lightning hit someone while they're gliding?"]),
  game("smash", "Super Smash Bros.", ["Will anyone get a 3-stock?", "Will anyone get an item KO?", "Will a stage hazard get a KO?", "Will anyone get a counter KO?", "Will anyone land a spike KO?"]),
  game("ea-fc", "EA Sports FC", ["Will anyone score a long shot from outside the box?", "Will a shot hit the crossbar?", "Will anyone score a direct free kick?", "Will anyone score from a corner?", "Will anyone score a bicycle kick?"]),
  game("other", "Another game", ["Will anyone pull off a comeback after falling behind?", "Will our first match last more than 20 minutes?", "Will the final match last longer than the first?", "Will anyone set a personal best tonight?", "Will we play more than three matches tonight?"]),
  {
    id: "keep-it-clean", category: "group", label: "Keep It Clean", name: "Keep It Clean",
    description: "Three bets about who gets caught breaking the rules first.",
    questions: [
      "Who gets caught swearing first?",
      "Who gets caught scrolling Instagram first?",
      "Who gets caught sleeping after 3 am first?",
    ],
    punishments: [
      "Do an impression of an animal the group picks",
      "Use a Discord display name chosen by the group for the day",
      "Bring snacks to the next hangout",
      "Sing the chorus of a song the group picks",
    ],
  },
  {
    id: "roommates", category: "roommate", label: "Roommate challenges", name: "Roommate challenges",
    description: "Small, funny predictions about life at home.",
    questions: ["Will our next delivery arrive before its estimated time?", "Will we try a new recipe together this week?", "Will our next takeout order include something extra?", "Will we watch a movie none of us has seen?"],
    punishments: ["Make breakfast for the house", "Choose and organize the next movie night", "Draw a mascot for the apartment", "Make a themed playlist for the apartment"],
  },
];

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
