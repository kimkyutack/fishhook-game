import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const source = "art/source/selection-game-ui.png";
const regions = {
  name: { left: 0, top: 90, width: 960, height: 350 },
  back: { left: 1000, top: 60, width: 450, height: 430 },
  start: { left: 0, top: 580, width: 960, height: 390 },
  check: { left: 1000, top: 550, width: 450, height: 450 },
};
const manifest = JSON.parse(
  await readFile("art/redesign-manifest.json", "utf8"),
);
for (const [name, crop] of Object.entries(regions)) {
  const { data, info } = await sharp(source)
    .extract(crop)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let x0 = info.width,
    y0 = info.height,
    x1 = 0,
    y1 = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[(y * info.width + x) * 4 + 3] > 16) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  const rect = {
    left: crop.left + Math.max(0, x0 - 3),
    top: crop.top + Math.max(0, y0 - 3),
    width: Math.min(info.width, x1 + 4) - Math.max(0, x0 - 3),
    height: Math.min(info.height, y1 + 4) - Math.max(0, y0 - 3),
  };
  const id = `selection-${name}`,
    runtime = `public/assets/redesign/${id}.png`;
  await sharp(source).extract(rect).png().toFile(runtime);
  const bytes = await readFile(runtime),
    meta = await sharp(bytes).metadata();
  manifest.entries = manifest.entries.filter(
    (e: { id: string }) => e.id !== id,
  );
  manifest.entries.push({
    id,
    kind: "ui-skin",
    status: "ready",
    source,
    crop: rect,
    variants: [
      {
        runtime,
        width: meta.width,
        height: meta.height,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        used: true,
      },
    ],
  });
  console.log(id, meta.width, meta.height);
}
manifest.logicalAssets = manifest.entries.length;
await writeFile(
  "art/redesign-manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
