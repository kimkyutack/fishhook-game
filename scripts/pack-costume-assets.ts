import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { characterRegions } from "./character-regions";
import { COSTUMES, costumeKey } from "../src/shared/costumes";
import { COSTUME_VIEWS } from "../src/client/game/costume-animations";

await mkdir("public/assets/costumes", { recursive: true });
const entries = [];
for (const gender of ["male", "female"] as const) {
  for (const costume of COSTUMES.filter((c) => c.id !== "default")) {
    const key = costumeKey(gender, costume.id);
    const sources = ["locomotion", "fishing", "action"].map(
      (kind) => `art/source/costumes/${gender}-${costume.id}-${kind}.png`,
    );
    const regions = await Promise.all(
      sources.map((source) => characterRegions(source)),
    );
    const scales = COSTUME_VIEWS.map(
      (_, row) => 156 / regions[0][row * 8].height,
    );
    const frames = [];
    const registrations = [];
    for (const [sheet, source] of sources.entries()) {
      const { data, info } = await sharp(source)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      for (let i = 3; i < data.length; i += 4)
        if (data[i] < 64) data.fill(0, i - 3, i + 1);
      const clean = await sharp(data, { raw: info }).png().toBuffer();
      for (const [i, r] of regions[sheet].entries()) {
        const row = Math.floor(i / 8),
          scale = scales[row];
        const width = Math.round(r.width * scale),
          height = Math.round(r.height * scale);
        const prone = sheet === 2 && [4, 5, 6].includes(i % 8);
        const left = Math.round(
          prone ? (192 - width) / 2 : 96 - (r.headX - r.left) * scale,
        );
        const top = 180 - height;
        if (left < 3 || top < 3 || left + width > 189 || top + height > 189)
          throw Error(
            `Clipped costume ${key}/${sheet}/${i}: ${JSON.stringify({ left, top, width, height })}`,
          );
        const input = await sharp(clean)
          .extract({
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
          })
          .resize(width, height)
          .png()
          .toBuffer();
        const frame = sheet * 40 + i;
        frames.push({
          input,
          left: (frame % 8) * 192 + left,
          top: Math.floor(frame / 8) * 192 + top,
        });
        registrations.push({
          source,
          sourceRegion: r,
          scale,
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
        width: 1536,
        height: 2880,
        channels: 4,
        background: "#00000000",
      },
    })
      .composite(frames)
      .webp({ quality: 95, alphaQuality: 100, effort: 6 })
      .toFile(runtime);
    const bytes = await readFile(runtime);
    entries.push({
      id: key,
      gender,
      costume: costume.id,
      sources,
      runtime,
      portrait: `public/assets/costumes/${key}_portrait.png`,
      width: 1536,
      height: 2880,
      frameWidth: 192,
      frameHeight: 192,
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
  "art/costume-manifest.json",
  JSON.stringify(
    {
      tool: "built-in image_gen",
      generatedSheets: 18,
      uniquePaintedFrames: 720,
      entries,
    },
    null,
    2,
  ) + "\n",
);
