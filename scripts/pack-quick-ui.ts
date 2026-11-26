import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const source = "art/source/quick-chat-ui.png",
  meta = await sharp(source).metadata(),
  manifest = JSON.parse(await readFile("art/redesign-manifest.json", "utf8"));
for (const [index, name] of ["chat", "close", "slot"].entries()) {
  const left = Math.floor((meta.width! * index) / 3),
    right = Math.floor((meta.width! * (index + 1)) / 3),
    crop = { left, top: 0, width: right - left, height: meta.height! };
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
  const figure = await sharp(data, { raw: info })
    .extract({ left: l, top: t, width: r - l + 1, height: b - t + 1 })
    .resize(120, 120, { fit: "contain", background: "#00000000" })
    .png()
    .toBuffer();
  const id = `quick-${name}`,
    runtime = `public/assets/redesign/${id}.png`;
  await sharp({
    create: { width: 128, height: 128, channels: 4, background: "#00000000" },
  })
    .composite([{ input: figure, left: 4, top: 4 }])
    .png()
    .toFile(runtime);
  const bytes = await readFile(runtime);
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
        width: 128,
        height: 128,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        used: true,
      },
    ],
  });
}
for (const e of manifest.entries)
  if (e.id === "areas-dock") {
    for (const v of e.variants) v.used = false;
    e.notes = [
      "Retained source asset; superseded by the requested compact quick-slot controls.",
    ];
  }
manifest.logicalAssets = manifest.entries.length;
await writeFile(
  "art/redesign-manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
