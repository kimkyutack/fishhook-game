import { expect, it } from "vitest";
import {
  costumePose,
  COSTUME_FRAME_SIZE,
  COSTUME_FOOT_BASELINE,
} from "../src/client/game/costume-animations";
import { ROOT } from "../src/client/game/animations";

it("uses the base character's action direction instead of retaining a diagonal fishing view", () => {
  expect(costumePose("down", "kick", "up-right")).toMatchObject({
    view: "down",
    flipX: false,
  });
  expect(costumePose("up", "run", "down-left")).toMatchObject({
    view: "up",
    flipX: false,
  });
  expect(costumePose("left", "kick", "up-left")).toMatchObject({
    view: "right",
    flipX: true,
  });
});
it("retains the base diagonal view and mirroring for movement and fishing", () => {
  expect(costumePose("down", "walk", "down-left")).toMatchObject({
    view: "down_right",
    flipX: true,
  });
  expect(costumePose("up", "idle", "up-right")).toMatchObject({
    view: "up_right",
    flipX: false,
  });
  expect(costumePose("up", "fishing_wait", "up-left")).toMatchObject({
    view: "up_right",
    flipX: true,
  });
});
it("keeps the same normalized foot origin when adding transparent room for hats", () => {
  expect(COSTUME_FRAME_SIZE * ROOT.y).toBe(COSTUME_FOOT_BASELINE);
  expect(COSTUME_FOOT_BASELINE / COSTUME_FRAME_SIZE).toBe(180 / 192);
});
