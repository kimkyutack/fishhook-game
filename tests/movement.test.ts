import { describe, it, expect } from "vitest";
import {
  actionDirection,
  movementFacing,
  cardinalDirection,
  type Facing,
} from "../src/shared/movement";
import { locomotionPose, visibleMotion } from "../src/client/game/animations";
import {
  cameraMapView,
  mapPosition,
  mapViewport,
} from "../src/client/game/minimap";
import { MAP } from "../src/config/map";
describe("eight-direction locomotion and minimap", () => {
  it("stands after falling from the chair and keeps normal catches seated", () => {
    expect(visibleMotion("startled", 300)).toBe("startled");
    expect(visibleMotion("startled", 700)).toBe("idle");
    expect(visibleMotion("reel_in", 800)).toBe("seated_idle");
  });
  it("chooses diagonals from both axes regardless of the previously pressed direction", () => {
    for (const previous of ["left", "down", "right", "up"] as const) {
      expect(movementFacing(-1, 1, previous)).toBe("down-left");
      expect(movementFacing(1, 1, previous)).toBe("down-right");
      expect(movementFacing(-1, -1, previous)).toBe("up-left");
      expect(movementFacing(1, -1, previous)).toBe("up-right");
    }
  });
  it("clears the released axis and keeps the final facing only when stationary", () => {
    expect(movementFacing(0, 1, "down-left")).toBe("down");
    expect(movementFacing(-1, 0, "down-left")).toBe("left");
    expect(movementFacing(0, 0, "down-left")).toBe("down-left");
    expect(cardinalDirection(-1, 1, "left")).toBe("down");
  });
  it("selects the matching front/rear diagonal gait and mirrors only the left side", () => {
    for (const [facing, key, flip] of [
      ["down-left", "down_right", true],
      ["down-right", "down_right", false],
      ["up-left", "up_right", true],
      ["up-right", "up_right", false],
    ] as const)
      expect(locomotionPose("down", "walk", facing)).toEqual({
        animationDirection: key,
        flipX: flip,
      });
    expect(locomotionPose("down", "idle", "down-left")).toEqual({
      animationDirection: "down_right",
      flipX: true,
    });
    for (const motion of ["kick", "run"] as const)
      expect(locomotionPose("right", motion, "down-left")).toEqual({
        animationDirection: "right",
        flipX: false,
      });
  });
  it("uses the actual displacement when a collision leaves only one axis", () => {
    expect(movementFacing(0, 12, "down-left")).toBe("down");
    expect(movementFacing(-12, 0, "down-left")).toBe("left");
  });
  it("projects world corners/center and the zoomed camera viewport accurately", () => {
    expect(mapPosition(MAP.width / 2, MAP.height / 2)).toEqual({
      left: "50%",
      top: "50%",
    });
    expect(mapPosition(-20, MAP.height + 20)).toEqual({
      left: "0%",
      top: "100%",
    });
    const view = cameraMapView(
      { scrollX: 2000, scrollY: 1000, width: 1000, height: 600, zoom: 0.5 },
      { x: 2500, y: 1300 },
    );
    expect(view).toEqual({
      x: 1500,
      y: 700,
      width: 2000,
      height: 1200,
      playerX: 2500,
      playerY: 1300,
    });
    expect(
      mapViewport({
        ...view,
        x: -100,
        y: -100,
        width: MAP.width + 200,
        height: MAP.height + 200,
      }),
    ).toEqual({ left: "0%", top: "0%", width: "100%", height: "100%" });
  });
});

it("action sprites face the target even after retreat changed the equipment direction", () => {
  expect(actionDirection("right")).toBe("right");
  expect(actionDirection("down-left")).toBe("down");
  expect(actionDirection("up-right")).toBe("up");
});
