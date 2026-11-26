import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const manifest = JSON.parse(
  await readFile("art/redesign-manifest.json", "utf8"),
);
for (const id of ["shop-frame-hd", "shop-card-hd"]) {
  const source = `art/source/${id}.png`,
    runtime = `public/assets/redesign/${id}.png`;
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4)
    if (data[i] < 8) data.fill(0, i - 3, i + 1);
  await sharp(data, { raw: info }).png().toFile(runtime);
  const bytes = await readFile(runtime);
  manifest.entries = manifest.entries.filter(
    (e: { id: string }) => e.id !== id,
  );
  manifest.entries.push({
    id,
    kind: "ui-skin",
    status: "ready",
    source,
    alphaNoiseCutoff: 8,
    variants: [
      {
        runtime,
        width: info.width,
        height: info.height,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        used: true,
      },
    ],
  });
  console.log(id, info.width, info.height);
}
for (const old of ["areas-shop"]) {
  const e = manifest.entries.find((e: { id: string }) => e.id === old);
  if (e) for (const v of e.variants) v.used = false;
}
manifest.logicalAssets = manifest.entries.length;
await writeFile(
  "art/redesign-manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
