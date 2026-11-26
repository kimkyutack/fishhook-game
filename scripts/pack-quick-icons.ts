import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const sources = {
  coin: "equipment/coin.png",
  fish_001: "fish/fish_001.png",
  worm: "redesign/worm.png",
  book: "redesign/book.png",
  settings: "equipment/settings.png",
  chair_down: "equipment/chair_down.png",
  rod_1: "redesign/rod_1.png",
  rod_2: "redesign/rod_2.png",
  rod_3: "redesign/rod_3.png",
  charge: "equipment/charge.png",
  bag: "redesign/bag.png",
  shop: "equipment/shop.png",
};
const manifest = JSON.parse(
  await readFile("art/redesign-manifest.json", "utf8"),
);
for (const [name, path] of Object.entries(sources)) {
  const source = "public/assets/" + path,
    { data, info } = await sharp(source)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  let l = info.width,
    t = info.height,
    r = 0,
    b = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[(y * info.width + x) * 4 + 3] > 24) {
        l = Math.min(l, x);
        r = Math.max(r, x);
        t = Math.min(t, y);
        b = Math.max(b, y);
      }
  l = Math.max(0, l - 2);
  t = Math.max(0, t - 2);
  r = Math.min(info.width - 1, r + 2);
  b = Math.min(info.height - 1, b + 2);
  const scale = 84 / Math.max(r - l + 1, b - t + 1),
    w = Math.round((r - l + 1) * scale),
    h = Math.round((b - t + 1) * scale);
  const figure = await sharp(source)
    .extract({ left: l, top: t, width: r - l + 1, height: b - t + 1 })
    .resize(w, h)
    .toBuffer();
  const id = `quick-${name}`,
    runtime = `public/assets/redesign/${id}.png`;
  await sharp({
    create: { width: 96, height: 96, channels: 4, background: "#00000000" },
  })
    .composite([
      {
        input: figure,
        left: Math.round((96 - w) / 2),
        top: Math.round((96 - h) / 2),
      },
    ])
    .png()
    .toFile(runtime);
  const bytes = await readFile(runtime);
  manifest.entries = manifest.entries.filter(
    (e: { id: string }) => e.id !== id,
  );
  manifest.entries.push({
    id,
    kind: "registered-ui-icon",
    status: "ready",
    source,
    derived: true,
    notes: [
      "Derived from an existing game icon; not a new AI generation.",
      "Alpha bounds centered on a96px canvas with84px maximum content.",
    ],
    variants: [
      {
        runtime,
        width: 96,
        height: 96,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        used: true,
      },
    ],
  });
}
manifest.logicalAssets = manifest.entries.length;
await writeFile(
  "art/redesign-manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
