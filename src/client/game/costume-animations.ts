import type { Motion } from "../../shared/protocol";
import type { Facing } from "../../shared/movement";
import { costumeKey, type CostumeId, type Gender } from "../../shared/costumes";
import { locomotionPose } from "./animations";
import type { Direction } from "../../config/map";

// Same world pixel scale as the 192px base frames; the extra transparent space
// holds hats without fitting the character down to a smaller size.
export const COSTUME_FRAME_SIZE = 224;
export const COSTUME_FOOT_BASELINE = 210;

export const COSTUME_VIEWS = [
  "down",
  "up",
  "right",
  "down_right",
  "up_right",
] as const;
export const COSTUME_POSES: Record<
  Exclude<Motion, "fallen">,
  { frames: number[]; fps: number; loop: boolean }
> = {
  idle: { frames: [0], fps: 1, loop: true },
  walk: { frames: [1, 2, 3, 4], fps: 8, loop: true },
  run: { frames: [5, 6], fps: 12, loop: true },
  sit_down: { frames: [40, 40, 41], fps: 7, loop: false },
  seated_idle: { frames: [41], fps: 1, loop: true },
  cast: { frames: [42, 42, 43, 43, 44], fps: 8, loop: false },
  fishing_wait: { frames: [44, 45], fps: 2, loop: true },
  reel_in: { frames: [46, 47, 46, 47, 41], fps: 7, loop: false },
  kick: { frames: [80, 80, 81, 81, 82], fps: 10, loop: false },
  startled: { frames: [7], fps: 1, loop: false },
};
export function costumeView(facing: Facing) {
  const flipX = facing.endsWith("left");
  const view = facing.replace("left", "right").replace("-", "_");
  return {
    row: Math.max(
      0,
      COSTUME_VIEWS.indexOf(view as (typeof COSTUME_VIEWS)[number]),
    ),
    view,
    flipX,
  };
}
export function costumePose(
  direction: Direction,
  motion: Motion,
  facing: Facing,
) {
  const pose = locomotionPose(direction, motion, facing);
  const view = costumeView(pose.animationDirection.replace("_", "-") as Facing);
  return { ...view, flipX: view.flipX !== pose.flipX };
}
export function costumeAnimationKey(
  gender: Gender,
  costume: CostumeId,
  view: string,
  motion: Motion,
) {
  return `${costumeKey(gender, costume)}_${view}_${motion}`;
}
