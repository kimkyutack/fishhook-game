import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { characterRegions } from "./character-regions";
const entries = [];
for (const gender of ["male", "female"]) {
  const sources = ["down-right", "up-right"].map(
    (dir) =>
      `art/source/${gender}-fishing-${dir}${gender === "female" ? "-clean" : ""}.png`,
  );
  const frames = [],
    registration = [];
  for (const [row, source] of sources.entries()) {
    const regions = await characterRegions(source, 5, 4);
    const standing = (regions[0].height + regions[19].height) / 2;
    const maxLeft = Math.max(...regions.map((r) => r.headX - r.left));
    const maxRight = Math.max(
      ...regions.map((r) => r.width - (r.headX - r.left)),
    );
    const scale = Math.min(
      156 / standing,
      174 / Math.max(...regions.map((r) => r.height)),
      88 / maxLeft,
      88 / maxRight,
    );
    const { data, info } = await sharp(source)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += 4)
      if (data[i] < 64) data.fill(0, i - 3, i + 1);
    const clean = await sharp(data, { raw: info }).png().toBuffer();
    for (const [i, r] of regions.entries()) {
      const width = Math.round(r.width * scale),
        height = Math.round(r.height * scale);
      const left = Math.round(96 - (r.headX - r.left) * scale),
        top = 180 - height;
      if (left < 4 || top < 4 || left + width > 188 || top + height > 188)
        throw Error(`Clipped ${gender}/${row}/${i}`);
      const input = await sharp(clean)
        .extract({ left: r.left, top: r.top, width: r.width, height: r.height })
        .resize(width, height)
        .png()
        .toBuffer();
      const frame = row * 20 + i;
      frames.push({
        input,
        left: (frame % 5) * 192 + left,
        top: Math.floor(frame / 5) * 192 + top,
      });
    }
    registration.push({ source, scale, regions });
  }
  const runtime = `public/assets/redesign/${gender}_fishing_diagonal.png`;
  await sharp({
    create: { width: 960, height: 1536, channels: 4, background: "#00000000" },
  })
    .composite(frames)
    .png({ palette: true, quality: 95, effort: 8 })
    .toFile(runtime);
  const bytes = await readFile(runtime);
  entries.push({
    id: `${gender}_fishing_diagonal`,
    kind: "fishing-animation-atlas",
    status: "ready",
    runtime,
    sources,
    registration,
    width: 960,
    height: 1536,
    frameWidth: 192,
    frameHeight: 192,
    columns: 5,
    rows: 8,
    frameCount: 40,
    paintedDirections: ["down-right", "up-right"],
    mirroredDirections: ["down-left", "up-left"],
    root: { x: 0.5, y: 0.9375 },
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  });
  console.log(runtime, bytes.length);
}
const chairSource = "art/source/fishing-diagonal-chairs.png",
  regions = await characterRegions(chairSource, 2, 2);
for (const [i, facing] of [
  "down-right",
  "down-left",
  "up-right",
  "up-left",
].entries()) {
  const r = regions[i],
    runtime = `public/assets/redesign/chair_${facing}.png`,
    scale = 220 / Math.max(r.width, r.height),
    width = Math.round(r.width * scale),
    height = Math.round(r.height * scale);
  const { data, info } = await sharp(chairSource)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4)
    if (data[i] < 64) data.fill(0, i - 3, i + 1);
  const figure = await sharp(data, { raw: info })
    .extract({ left: r.left, top: r.top, width: r.width, height: r.height })
    .resize(width, height)
    .png()
    .toBuffer();
  await sharp({
    create: { width: 256, height: 256, channels: 4, background: "#00000000" },
  })
    .composite([
      { input: figure, left: Math.round((256 - width) / 2), top: 236 - height },
    ])
    .png()
    .toFile(runtime);
  const bytes = await readFile(runtime);
  entries.push({
    id: `chair_${facing}`,
    kind: "directional-chair",
    status: "ready",
    source: chairSource,
    runtime,
    width: 256,
    height: 256,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  });
}
await writeFile(
  "art/fishing-manifest.json",
  JSON.stringify(
    {
      tool: "built-in image_gen",
      generatedSheets: 5,
      cleanedSheets: 2,
      newPaintedCharacterFrames: 80,
      runtimeAtlases: 2,
      diagonalChairs: 4,
      notes: [
        "Four existing cardinal fishing directions are retained.",
        "Left diagonal character poses mirror the matching right camera view.",
        "Global per-sheet scale and head registration; never independently fit each animation frame.",
      ],
      entries,
    },
    null,
    2,
  ) + "\n",
);
