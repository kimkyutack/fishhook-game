import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
const sources = {
  bag: "redesign/bag.png",
  coin: "equipment/coin.png",
  rod_1: "redesign/rod_1.png",
  worm: "redesign/worm.png",
  book: "redesign/book.png",
  settings: "equipment/settings.png",
};
const records = [];
for (const [id, rel] of Object.entries(sources)) {
  const source = `public/assets/${rel}`,
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
  const scale = 440 / Math.max(r - l + 1, b - t + 1),
    w = Math.round((r - l + 1) * scale),
    h = Math.round((b - t + 1) * scale);
  const figure = await sharp(source)
    .extract({ left: l, top: t, width: r - l + 1, height: b - t + 1 })
    .resize(w, h)
    .toBuffer();
  const runtime = `public/assets/redesign/pocket-icon-${id}.png`;
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: "#00000000" },
  })
    .composite([
      {
        input: figure,
        left: Math.round((512 - w) / 2),
        top: Math.round((512 - h) / 2),
      },
    ])
    .png()
    .toFile(runtime);
  records.push({
    id,
    source,
    sourceWidth: info.width,
    sourceHeight: info.height,
    runtime,
    derived: true,
    notes:
      "Existing artwork registered from original resolution; not a new AI image or source-detail upscale claim.",
  });
}
await writeFile(
  "art/prompts/pocket-registered-icons.json",
  JSON.stringify(records, null, 2) + "\n",
);
