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
  if (e.kind === "character-atlas") {
    if (e.registration?.regions.length !== 40)
      throw Error(`Missing intact-figure registration: ${e.id}`);
    const { data, info } = await sharp(b)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let frame = 0; frame < 40; frame++) {
      for (let y = 0; y < 192; y++)
        for (let x = 0; x < 192; x++) {
          if (x >= 4 && x < 188 && y >= 4 && y < 188) continue;
          const offset =
            ((Math.floor(frame / 8) * 192 + y) * info.width +
              (frame % 8) * 192 +
              x) *
            4;
          if (data[offset + 3] > 32)
            throw Error(`Character reaches frame edge: ${e.id} frame ${frame}`);
        }
    }
  }
  if (e.kind === "fish") {
    const hash = createHash("sha256").update(b).digest("hex");
    if (hashes.has(hash)) throw Error(`Duplicate fish: ${e.id}`);
    hashes.add(hash);
    if (!m.hasAlpha && !e.opaqueSurface)
      throw Error(`Missing fish alpha: ${e.id}`);
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
const redesign = JSON.parse(
  await readFile("art/redesign-manifest.json", "utf8"),
);
if (redesign.logicalAssets !== redesign.entries.length)
  throw Error("Redesign count mismatch");
for (const e of redesign.entries) {
  await readFile(e.source);
  if (e.status !== "ready") throw Error(`Unfinished redesign asset: ${e.id}`);
  for (const v of e.variants) {
    const bytes = await readFile(v.runtime),
      metadata = await sharp(bytes).metadata();
    if (
      metadata.width !== v.width ||
      metadata.height !== v.height ||
      createHash("sha256").update(bytes).digest("hex") !== v.sha256
    )
      throw Error(`Redesign asset changed: ${v.runtime}`);
    if (e.kind !== "environment" && !e.opaqueSurface && !metadata.hasAlpha)
      throw Error(`Missing UI alpha: ${e.id}`);
    if (e.kind === "diagonal-walk-atlas") {
      if (
        e.frameCount !== 12 ||
        metadata.width !== 1152 ||
        metadata.height !== 384
      )
        throw Error(`Wrong diagonal atlas: ${e.id}`);
      const { data, info } = await sharp(bytes)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      for (let frame = 0; frame < 12; frame++) {
        let pixels = 0;
        for (let y = 0; y < 192; y++)
          for (let x = 0; x < 192; x++) {
            const alpha =
              data[
                ((Math.floor(frame / 6) * 192 + y) * info.width +
                  (frame % 6) * 192 +
                  x) *
                  4 +
                  3
              ];
            if (alpha > 64) pixels++;
            if ((x < 4 || x >= 188 || y < 4 || y >= 188) && alpha > 32)
              throw Error(`Clipped diagonal frame ${e.id}/${frame}`);
          }
        if (pixels < 2000) throw Error(`Empty diagonal frame ${e.id}/${frame}`);
      }
    }
  }
}
console.log(
  `${redesign.logicalAssets} redesign assets verified (PNG/WebP variants counted once)`,
);
const kick = JSON.parse(await readFile("art/kick-manifest.json", "utf8"));
if (kick.entries.length !== 2 || kick.totalFrames !== 96)
  throw Error("Missing kick character atlases");
for (const e of kick.entries) {
  for (const source of e.sources) await readFile(source);
  const bytes = await readFile(e.runtime);
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    info.width !== 1152 ||
    info.height !== 1536 ||
    e.frameCount !== 48 ||
    e.directions.length !== 8 ||
    createHash("sha256").update(bytes).digest("hex") !== e.sha256
  )
    throw Error(`Invalid fall atlas ${e.id}`);
  for (let frame = 0; frame < 48; frame++) {
    let pixels = 0;
    for (let y = 0; y < 192; y++)
      for (let x = 0; x < 192; x++) {
        const alpha =
          data[
            ((Math.floor(frame / 6) * 192 + y) * info.width +
              (frame % 6) * 192 +
              x) *
              4 +
              3
          ];
        if (alpha > 64) pixels++;
        if ((x < 4 || x >= 188 || y < 4 || y >= 188) && alpha > 32)
          throw Error(`Clipped fall frame ${e.id}/${frame}`);
      }
    if (pixels < 2000) throw Error(`Empty fall frame ${e.id}/${frame}`);
  }
}
console.log(
  "96 fall/get-up frames checked: both characters, all eight directions, clear frame edges.",
);

await import("./check-fishing-assets.ts");
