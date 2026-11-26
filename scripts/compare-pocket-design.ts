import sharp from "sharp";
import { writeFile } from "node:fs/promises";
const stage = process.argv[2] || "final";
const source = "design/2026-11-26-shop-bag-concepts/01.png";
const metrics = [];
for (const [name, left] of [
  ["bag", 43],
  ["shop", 1007],
] as const) {
  const ref = await sharp(source)
    .extract({ left, top: 80, width: 936, height: 656 })
    .removeAlpha()
    .raw()
    .toBuffer();
  const actual = await sharp(`output/pocket-qa/${name}-${stage}.jpg`)
    .extract({ left: 172, top: 64, width: 936, height: 656 })
    .removeAlpha()
    .raw()
    .toBuffer();
  const half = Buffer.alloc(ref.length),
    diff = Buffer.alloc(ref.length);
  let mae = 0;
  for (let i = 0; i < ref.length; i++) {
    half[i] = Math.round((ref[i] + actual[i]) / 2);
    diff[i] = Math.abs(ref[i] - actual[i]);
    mae += diff[i];
  }
  const raw = { width: 936, height: 656, channels: 3 as const };
  await sharp({
    create: { width: 1872, height: 656, channels: 3, background: "#fff" },
  })
    .composite([
      { input: ref, raw, left: 0, top: 0 },
      { input: actual, raw, left: 936, top: 0 },
    ])
    .jpeg({ quality: 95 })
    .toFile(`output/pocket-qa/${name}-comparison-${stage}.jpg`);
  await sharp(half, { raw })
    .png()
    .toFile(`output/pocket-qa/${name}-overlay-${stage}.png`);
  await sharp(diff, { raw })
    .png()
    .toFile(`output/pocket-qa/${name}-pixel-difference-${stage}.png`);
  metrics.push({
    name,
    referenceCrop: { left, top: 80, width: 936, height: 656 },
    implementationCrop: { left: 172, top: 64, width: 936, height: 656 },
    allPixelsCompared: 936 * 656,
    meanAbsoluteChannelDifference: mae / ref.length,
    note: "Raw pixel difference includes actual catalogue artwork, real prices/star counts, generated frame details and font rasterization; it is not an equivalence score.",
  });
}
await writeFile(
  "output/pocket-qa/pixel-metrics.json",
  JSON.stringify(metrics, null, 2) + "\n",
);
