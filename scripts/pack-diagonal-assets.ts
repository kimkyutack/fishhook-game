import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { characterRegions } from "./character-regions";
const manifest = JSON.parse(
  await readFile("art/redesign-manifest.json", "utf8"),
);
for (const gender of ["male", "female"]) {
  const source = `art/source/${gender}-diagonal-walk-clean.png`,
    regions = await characterRegions(source, 6, 2);
  const scale =
      156 / (regions.slice(0, 6).reduce((n, r) => n + r.height, 0) / 6),
    frames = [];
  for (const [i, r] of regions.entries()) {
    const left = Math.round(96 - (r.headX - r.left) * scale),
      top = 180 - Math.round(r.height * scale);
    if (left < 4 || top < 4 || left + Math.round(r.width * scale) > 188)
      throw Error(`Unsafe figure bounds ${gender}/${i}`);
    const figure = await sharp(source)
      .extract({ left: r.left, top: r.top, width: r.width, height: r.height })
      .resize(Math.round(r.width * scale), Math.round(r.height * scale))
      .png()
      .toBuffer();
    const frame = await sharp({
      create: { width: 192, height: 192, channels: 4, background: "#00000000" },
    })
      .composite([{ input: figure, left, top }])
      .png()
      .toBuffer();
    frames.push({
      input: frame,
      left: (i % 6) * 192,
      top: Math.floor(i / 6) * 192,
    });
  }
  const id = `${gender}_diagonal`,
    runtime = `public/assets/redesign/${id}.png`;
  await sharp({
    create: { width: 1152, height: 384, channels: 4, background: "#00000000" },
  })
    .composite(frames)
    .png({ palette: true, quality: 95, effort: 8 })
    .toFile(runtime);
  const bytes = await readFile(runtime);
  manifest.entries = manifest.entries.filter(
    (e: { id: string }) => e.id !== id,
  );
  manifest.entries.push({
    id,
    kind: "diagonal-walk-atlas",
    status: "ready",
    source,
    frameCount: 12,
    columns: 6,
    rows: 2,
    frameWidth: 192,
    frameHeight: 192,
    root: { x: 0.5, y: 0.9375 },
    registration: { scale, regions },
    notes: [
      "Top row southeast; bottom row northeast. Horizontal mirroring supplies southwest and northwest.",
      "One scale per character; fixed head center and foot baseline.",
    ],
    variants: [
      {
        runtime,
        width: 1152,
        height: 384,
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
console.log("Packed 24 diagonal walking frames in two atlases.");
