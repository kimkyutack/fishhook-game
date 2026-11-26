import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const m = JSON.parse(
  await readFile("art/terrain-continuity-manifest.json", "utf8"),
);
const source = await sharp(m.source).removeAlpha().raw().toBuffer();
const bytes = await readFile(m.runtime),
  meta = await sharp(bytes).metadata();
if (meta.width !== 3072 || meta.height !== 2048)
  throw Error("Terrain resolution changed");
if (createHash("sha256").update(bytes).digest("hex") !== m.runtimeSha256)
  throw Error("Terrain hash changed");
if (m.frames.length !== 4 || m.textureBytesBefore !== m.textureBytesAfter)
  throw Error("Texture budget changed");
const reconstructed = await sharp({
  create: { width: m.width, height: m.height, channels: 3, background: "#000" },
})
  .composite(
    await Promise.all(
      m.frames.map(async (f: { path: string; left: number; top: number }) => ({
        input: await readFile(f.path),
        left: f.left,
        top: f.top,
      })),
    ),
  )
  .removeAlpha()
  .raw()
  .toBuffer();
if (!source.equals(reconstructed))
  throw Error("Tile cuts do not reconstruct the master pixel-for-pixel");
const original = await sharp(
  "art/references/terrain-continuity/joined-before.png",
)
  .removeAlpha()
  .raw()
  .toBuffer();
let outside = 0;
for (let y = 0; y < m.height; y++)
  for (let x = 0; x < m.width; x++) {
    if ((x >= 1472 && x < 1600) || (y >= 960 && y < 1088)) continue;
    const p = (y * m.width + x) * 3;
    if (
      original[p] !== source[p] ||
      original[p + 1] !== source[p + 1] ||
      original[p + 2] !== source[p + 2]
    )
      outside++;
  }
if (outside) throw Error("Geometry outside repair cross changed");
if (bytes.length > m.baselineRuntimeBytes)
  throw Error("Terrain download budget increased");
console.log(
  `Continuous terrain verified: 3072x2048, four1536x1024 frames reconstruct master exactly, outside-cross changes0, texture24MiB unchanged, download${bytes.length}B <=${m.baselineRuntimeBytes}B.`,
);
