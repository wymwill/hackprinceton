/** The ordered navigation walkthrough, shared by the UI and reward endpoint. */
export const TOUR_STEPS = ["home", "new-series", "join", "groups", "friends", "profile", "help"] as const;
export function completedNavigationTour(value: unknown): boolean {
  return Array.isArray(value) && value.length === TOUR_STEPS.length && TOUR_STEPS.every((step, i) => value[i] === step);
}
