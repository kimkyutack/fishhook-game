import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { COSTUMES, costumeKey } from "../src/shared/costumes";
import {
  COSTUME_POSES,
  COSTUME_VIEWS,
  costumeView,
  COSTUME_FRAME_SIZE as SIZE,
  COSTUME_FOOT_BASELINE as FOOT,
} from "../src/client/game/costume-animations";
import { costumeHead } from "./costume-registration";
import { FALL_DIRECTIONS } from "../src/shared/kick";

const manifest = JSON.parse(
  await readFile("art/costume-manifest.json", "utf8"),
);
if (
  manifest.entries.length !== 6 ||
  manifest.generatedSheets !== 18 ||
  manifest.uniquePaintedFrames !== 720 ||
  manifest.registrationVersion !== 2
)
  throw Error(
    "Incomplete costume set: expected both genders × three outfits × 120 painted frames",
  );
for (const gender of ["male", "female"] as const) {
  for (const costume of COSTUMES.filter((c) => c.id !== "default")) {
    const id = costumeKey(gender, costume.id),
      entry = manifest.entries.find((e: { id: string }) => e.id === id);
    if (
      !entry ||
      entry.frameCount !== 120 ||
      entry.registrations.length !== 120
    )
      throw Error(`Missing ${id}`);
    for (const source of entry.sources) await readFile(source);
    const bytes = await readFile(entry.runtime);
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256)
      throw Error(`Stale ${id}`);
    const { data, info } = await sharp(bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.width !== SIZE * 8 || info.height !== SIZE * 15)
      throw Error(`Wrong canvas ${id}`);
    for (let frame = 0; frame < 120; frame++) {
      let pixels = 0;
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          const alpha =
            data[
              ((Math.floor(frame / 8) * SIZE + y) * info.width +
                (frame % 8) * SIZE +
                x) *
                4 +
                3
            ];
          if (alpha > 64) pixels++;
          if ((x < 2 || x >= SIZE - 2 || y < 2 || y >= SIZE - 2) && alpha > 32)
            throw Error(`Clipped ${id}/${frame}`);
        }
      if (pixels < 2000) throw Error(`Empty ${id}/${frame}`);
    }
    for (let row = 0; row < 5; row++) {
      const registration = entry.registrations[row * 8],
        b = registration.bounds;
      const head = costumeHead(data, info.width, {
        ...b,
        left: b.left,
        top: row * SIZE + b.top,
        headX: 0,
      });
      const fit = entry.calibration[0].fits[row];
      if (Math.abs(head.width - fit.targetHeadWidth) > 3)
        throw Error(
          `Head size differs from base: ${id}/${row}: ${head.width} vs ${fit.targetHeadWidth}`,
        );
      if (
        Math.abs(b.height - fit.referenceHeight - fit.hatAllowance) > 1 ||
        Math.abs(b.top + b.height - FOOT) > 1
      )
        throw Error(`Wrong body registration ${id}/${row}`);
    }
    const portrait = await sharp(await readFile(entry.portrait)).metadata();
    if (portrait.width !== 384 || portrait.height !== 384 || !portrait.hasAlpha)
      throw Error(`Bad portrait ${id}`);
  }
}
for (const direction of FALL_DIRECTIONS) {
  const { row, view } = costumeView(direction);
  if (
    row < 0 ||
    row >= COSTUME_VIEWS.length ||
    !COSTUME_VIEWS.includes(view as (typeof COSTUME_VIEWS)[number])
  )
    throw Error(`Missing costume direction ${direction}`);
  for (const [motion, spec] of Object.entries(COSTUME_POSES))
    if (spec.frames.some((frame) => frame + row * 8 >= 120))
      throw Error(`Bad ${direction}/${motion}`);
}
console.log(
  "Costumes: 720 unclipped frames, 6 portraits; base head widths within3px, fixed foot anchors, shared direction contract and unchanged world scale.",
);
