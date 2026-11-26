import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const source = "art/source/modern-hud-skins.png";
const crops = {
  panel: { left: 60, top: 106, width: 694, height: 416 },
  header: { left: 784, top: 106, width: 696, height: 416 },
  primary: { left: 48, top: 594, width: 708, height: 280 },
  secondary: { left: 782, top: 594, width: 706, height: 280 },
};
const manifest = JSON.parse(
  await readFile("art/redesign-manifest.json", "utf8"),
);
for (const [name, rect] of Object.entries(crops)) {
  const id = `modern-${name}`,
    runtime = `public/assets/redesign/${id}.png`;
  await sharp(source).extract(rect).png().toFile(runtime);
  const bytes = await readFile(runtime);
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
        width: rect.width,
        height: rect.height,
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
