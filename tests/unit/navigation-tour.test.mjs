import { test } from "node:test";
import assert from "node:assert/strict";
import { completedNavigationTour, TOUR_STEPS } from "../../shared/navigationTour.ts";

test("only a complete, ordered navigation walkthrough can claim the reward", () => {
  assert.equal(completedNavigationTour([...TOUR_STEPS]), true);
  for (const value of [null, {}, [], TOUR_STEPS.slice(1), [...TOUR_STEPS].reverse(), [...TOUR_STEPS, "help"], TOUR_STEPS.map(() => "home")]) {
    assert.equal(completedNavigationTour(value), false);
  }
});
