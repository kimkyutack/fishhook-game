import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const source = "art/source/game-area-skins.png";
const crops = {
  bag: { left: 0, top: 50, width: 443, height: 460 },
  shop: { left: 448, top: 80, width: 439, height: 420 },
  rank: { left: 0, top: 610, width: 440, height: 220 },
  currency: { left: 450, top: 630, width: 437, height: 185 },
  dock: { left: 0, top: 990, width: 443, height: 240 },
  chat: { left: 450, top: 970, width: 437, height: 280 },
  map: { left: 0, top: 1330, width: 440, height: 410 },
  tab: { left: 450, top: 1410, width: 437, height: 255 },
};
const manifest = JSON.parse(
  await readFile("art/redesign-manifest.json", "utf8"),
);
for (const [name, crop] of Object.entries(crops)) {
  const { data, info } = await sharp(source)
    .extract(crop)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let l = info.width,
    t = info.height,
    r = 0,
    b = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      if (data[i + 3] < 8) data.fill(0, i, i + 4);
      if (data[i + 3] > 24) {
        l = Math.min(l, x);
        r = Math.max(r, x);
        t = Math.min(t, y);
        b = Math.max(b, y);
      }
    }
  l = Math.max(0, l - 3);
  t = Math.max(0, t - 3);
  r = Math.min(info.width - 1, r + 3);
  b = Math.min(info.height - 1, b + 3);
  const id = `areas-${name}`,
    runtime = `public/assets/redesign/${id}.png`;
  await sharp(data, { raw: info })
    .extract({ left: l, top: t, width: r - l + 1, height: b - t + 1 })
    .png()
    .toFile(runtime);
  const bytes = await readFile(runtime),
    m = await sharp(bytes).metadata();
  manifest.entries = manifest.entries.filter(
    (e: { id: string }) => e.id !== id,
  );
  manifest.entries.push({
    id,
    kind: "ui-skin",
    status: "ready",
    source,
    crop,
    alphaNoiseCutoff: 8,
    variants: [
      {
        runtime,
        width: m.width,
        height: m.height,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        used: true,
      },
    ],
  });
  console.log(id, m.width, m.height);
}
manifest.logicalAssets = manifest.entries.length;
await writeFile(
  "art/redesign-manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
