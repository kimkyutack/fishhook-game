import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { FISH } from "../src/shared/catalog";
const manifest = JSON.parse(await readFile("art/manifest.json", "utf8"));
const hashes = new Set<string>();
for (const e of manifest.entries) {
  const b = await readFile(e.runtime);
  const m = await sharp(b).metadata();
  if (m.width !== e.width || m.height !== e.height)
    throw Error(`Size mismatch: ${e.id}`);
  if (e.status !== "ready") throw Error(`Unfinished asset: ${e.id}`);
  if (e.kind === "fish") {
    const hash = createHash("sha256").update(b).digest("hex");
    if (hashes.has(hash)) throw Error(`Duplicate fish: ${e.id}`);
    hashes.add(hash);
    if (!m.hasAlpha) throw Error(`Missing fish alpha: ${e.id}`);
  }
}
if (hashes.size !== 50) throw Error("Expected 50 unique fish images");
for (const f of FISH)
  if (!manifest.entries.some((e: { id: string }) => e.id === f.id))
    throw Error(f.id);
for (const g of ["male", "female"])
  for (const d of ["down", "up", "left", "right"])
    if (
      !manifest.entries.some(
        (e: { id: string; frameCount: number }) =>
          e.id === `${g}_${d}` && e.frameCount === 39,
      )
    )
      throw Error(`Missing motion ${g} ${d}`);
console.log(
  `${manifest.runtimeFiles} PNG files checked; 50 unique fish; 312 character frames; no placeholders`,
);
