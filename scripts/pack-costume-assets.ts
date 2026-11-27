import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { characterRegions } from "./character-regions";
import { COSTUMES, costumeKey } from "../src/shared/costumes";
import {
  COSTUME_VIEWS,
  COSTUME_FRAME_SIZE as SIZE,
  COSTUME_FOOT_BASELINE as FOOT,
} from "../src/client/game/costume-animations";
import { costumeHead } from "./costume-registration";

await mkdir("public/assets/costumes", { recursive: true });
const entries = [];
const only = process.argv[2];
for (const gender of ["male", "female"] as const) {
  for (const costume of COSTUMES.filter((c) => c.id !== "default")) {
    const key = costumeKey(gender, costume.id);
    if (only && only !== key) continue;
    const sources = ["locomotion", "fishing", "action"].map(
      (kind) => `art/source/costumes/v2/${gender}-${costume.id}-${kind}.png`,
    );
    const references = ["locomotion", "fishing", "action"].map(
      (kind) => `art/references/costume-fit/${gender}-${kind}.png`,
    );
    const regions = await Promise.all(
      sources.map((source) => characterRegions(source)),
    );
    const referenceRegions = await Promise.all(
      references.map((p) => characterRegions(p)),
    );
    const calibration = [];
    const frames = [];
    const registrations = [];
    for (const [sheet, source] of sources.entries()) {
      const { data, info } = await sharp(source)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      for (let i = 3; i < data.length; i += 4)
        if (data[i] < 64) data.fill(0, i - 3, i + 1);
      const ref = await sharp(references[sheet])
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const allowance = costume.id === "office" ? 0 : 12;
      const fits = COSTUME_VIEWS.map((_, row) => {
        const sourceRegion = regions[sheet][row * 8],
          targetRegion = referenceRegions[sheet][row * 8];
        const sourceHead = costumeHead(data, info.width, sourceRegion),
          targetHead = costumeHead(ref.data, ref.info.width, targetRegion);
        return {
          scaleX: targetHead.width / sourceHead.width,
          scaleY: (targetRegion.height + allowance) / sourceRegion.height,
          targetHeadWidth: targetHead.width,
          hatAllowance: allowance,
          referenceHeight: targetRegion.height,
        };
      });
      calibration.push({ source, reference: references[sheet], fits });
      for (const [i, r] of regions[sheet].entries()) {
        const row = Math.floor(i / 8),
          { scaleX, scaleY } = fits[row];
        const referenceRegion = referenceRegions[sheet][i];
        const width = Math.round(r.width * scaleX),
          height = Math.round(r.height * scaleY);
        const prone = sheet === 2 && [4, 5, 6].includes(i % 8);
        const sourceHead = prone ? undefined : costumeHead(data, info.width, r);
        const targetHead = prone
          ? undefined
          : costumeHead(ref.data, ref.info.width, referenceRegion);
        const left = Math.round(
          prone
            ? SIZE / 2 +
                (referenceRegion.left +
                  referenceRegion.width / 2 -
                  (i % 8) * 192 -
                  96) -
                width / 2
            : SIZE / 2 +
                (targetHead!.x - (i % 8) * 192 - 96) -
                (sourceHead!.x - r.left) * scaleX,
        );
        const top =
          FOOT +
          (referenceRegion.top + referenceRegion.height - row * 192 - 180) -
          height;
        if (
          left < 3 ||
          top < 3 ||
          left + width > SIZE - 3 ||
          top + height > SIZE - 3
        )
          throw Error(
            `Clipped costume ${key}/${sheet}/${i}: ${JSON.stringify({ left, top, width, height })}`,
          );
        const input = await sharp(data, { raw: info })
          .extract({
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
          })
          .resize(width, height, { fit: "fill" })
          .png()
          .toBuffer();
        const frame = sheet * 40 + i;
        frames.push({
          input,
          left: (frame % 8) * SIZE + left,
          top: Math.floor(frame / 8) * SIZE + top,
        });
        registrations.push({
          source,
          sourceRegion: r,
          scaleX,
          scaleY,
          reference: references[sheet],
          referenceRegion,
          frame,
          bounds: { left, top, width, height },
        });
        if (sheet === 0 && i === 0)
          await sharp(input)
            .resize(384, 384, { fit: "contain", background: "#00000000" })
            .png()
            .toFile(`public/assets/costumes/${key}_portrait.png`);
      }
    }
    const runtime = `public/assets/costumes/${key}.webp`;
    await sharp({
      create: {
        width: SIZE * 8,
        height: SIZE * 15,
        channels: 4,
        background: "#00000000",
      },
    })
      .composite(frames)
      .webp({ quality: 95, alphaQuality: 100, effort: 4 })
      .toFile(runtime);
    const bytes = await readFile(runtime);
    entries.push({
      id: key,
      gender,
      costume: costume.id,
      sources,
      references,
      calibration,
      runtime,
      portrait: `public/assets/costumes/${key}_portrait.png`,
      width: SIZE * 8,
      height: SIZE * 15,
      frameWidth: SIZE,
      frameHeight: SIZE,
      frameCount: 120,
      views: COSTUME_VIEWS,
      mirroredViews: ["left", "down-left", "up-left"],
      registrations,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    console.log(`${key}: 120 registered frames, ${bytes.length} bytes`);
  }
}
await writeFile(
  only
    ? `output/costume-fit-qa/${only}-manifest.json`
    : "art/costume-manifest.json",
  JSON.stringify(
    {
      tool: "built-in image_gen",
      registrationVersion: 2,
      fit: "Base frame camera and poses; head width and foot anchors; hats retain extra space without shrinking the body.",
      generatedSheets: entries.length * 3,
      uniquePaintedFrames: entries.length * 120,
      entries,
    },
    null,
    2,
  ) + "\n",
);
