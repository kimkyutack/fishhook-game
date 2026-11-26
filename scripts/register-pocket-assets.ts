import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const manifest = JSON.parse(
  await readFile("art/redesign-manifest.json", "utf8"),
);
for (const id of [
  "pocket-panel",
  "pocket-title",
  "pocket-nav",
  "pocket-tray",
  "pocket-fish-icon",
  "pocket-button-blue",
  "pocket-button-coral",
  "pocket-store",
  "pocket-lock",
  "pocket-speaker",
  "pocket-coins",
  "pocket-wave",
  "pocket-settings",
  "pocket-worm",
  "pocket-icon-bag",
  "pocket-icon-coin",
  "pocket-icon-rod_1",
  "pocket-icon-worm",
  "pocket-icon-book",
  "pocket-icon-settings",
]) {
  const runtime = `public/assets/redesign/${id}.png`,
    source = id.startsWith("pocket-icon-")
      ? JSON.parse(
          await readFile("art/prompts/pocket-registered-icons.json", "utf8"),
        ).find((r: { id: string }) => r.id === id.replace("pocket-icon-", ""))
          .source
      : `art/source/${["pocket-settings", "pocket-worm"].includes(id) ? "pocket-nav-details" : id.startsWith("pocket-button-") ? "pocket-buttons" : ["pocket-store", "pocket-lock", "pocket-speaker", "pocket-coins"].includes(id) ? "pocket-detail-icons" : id}.png`,
    bytes = await readFile(runtime),
    m = await sharp(bytes).metadata();
  manifest.entries = manifest.entries.filter(
    (e: { id: string }) => e.id !== id,
  );
  manifest.entries.push({
    id,
    kind: id.startsWith("pocket-icon-")
      ? "registered-ui-icon"
      : "selected-pocket-ui",
    derived: id.startsWith("pocket-icon-"),
    opaqueSurface: ["pocket-panel", "pocket-tray"].includes(id),
    status: "ready",
    source,
    reference: "design/2026-11-26-shop-bag-concepts/01.png",
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
}
for (const id of ["areas-bag", "areas-shop", "shop-frame-hd", "shop-card-hd"]) {
  const e = manifest.entries.find((e: { id: string }) => e.id === id);
  if (e) for (const v of e.variants) v.used = false;
}
manifest.logicalAssets = manifest.entries.length;
await writeFile(
  "art/redesign-manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
