import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { characterRegions } from "./character-regions";
import { FALL_DIRECTIONS } from "../src/shared/kick";

const entries = [];
for (const gender of ["male", "female"]) {
  const sources = ["cardinal", "diagonal"].map(
    (s) => `art/source/${gender}-fall-${s}.png`,
  );
  const regions = await Promise.all(
    sources.map((s, i) => characterRegions(s, 6, i ? 2 : 4)),
  );
  // All poses from one source share one scale, measured from its standing figures.
  const scales = regions.map(
    (rs) =>
      156 /
      (rs.filter((_, i) => i % 6 === 5).reduce((sum, r) => sum + r.height, 0) /
        (rs.length / 6)),
  );
  const views = [
    { sheet: 0, row: 0, flip: false },
    { sheet: 0, row: 1, flip: false },
    { sheet: 0, row: 2, flip: true },
    { sheet: 0, row: 3, flip: false },
    { sheet: 1, row: 0, flip: true },
    { sheet: 1, row: 0, flip: false },
    { sheet: 1, row: 1, flip: true },
    { sheet: 1, row: 1, flip: false },
  ];
  const frames = [];
  for (const [row, view] of views.entries()) {
    for (let col = 0; col < 6; col++) {
      const r = regions[view.sheet][view.row * 6 + col];
      const width = Math.round(r.width * scales[view.sheet]),
        height = Math.round(r.height * scales[view.sheet]);
      const left = Math.round(96 - width / 2),
        top = 180 - height;
      if (left < 4 || top < 4 || left + width > 188)
        throw Error(`Clipped ${gender}/${row}/${col}`);
      let figure = sharp(sources[view.sheet]).extract({
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
      });
      if (view.flip) figure = figure.flop();
      const input = await figure.resize(width, height).png().toBuffer();
      frames.push({ input, left: col * 192 + left, top: row * 192 + top });
    }
  }
  const runtime = `public/assets/redesign/${gender}_fall.png`;
  await sharp({
    create: { width: 1152, height: 1536, channels: 4, background: "#00000000" },
  })
    .composite(frames)
    .png({ palette: true, quality: 95, effort: 8 })
    .toFile(runtime);
  const bytes = await readFile(runtime);
  entries.push({
    id: `${gender}_fall`,
    kind: "eight-direction-fall-atlas",
    status: "ready",
    sources,
    runtime,
    frameCount: 48,
    frameWidth: 192,
    frameHeight: 192,
    columns: 6,
    rows: 8,
    directions: FALL_DIRECTIONS,
    poses: ["stumble", "fall", "ground", "recover", "push-up", "stand"],
    root: { x: 0.5, y: 0.9375 },
    registration: { scales, regions, views },
    width: 1152,
    height: 1536,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
await writeFile(
  "art/kick-manifest.json",
  JSON.stringify(
    {
      tool: "built-in image_gen",
      generatedSheets: 4,
      runtimeAtlases: 2,
      totalFrames: 96,
      entries,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Packed 96 fall/get-up frames: 2 characters × 8 directions × 6 poses.",
);
