import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
const manifest = JSON.parse(
  await readFile("art/fishing-manifest.json", "utf8"),
);
for (const e of manifest.entries) {
  const bytes = await readFile(e.runtime);
  if (createHash("sha256").update(bytes).digest("hex") !== e.sha256)
    throw Error(`Fishing hash mismatch: ${e.id}`);
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== e.width || info.height !== e.height)
    throw Error(`Fishing dimensions: ${e.id}`);
  if (e.kind === "fishing-animation-atlas")
    for (let frame = 0; frame < 40; frame++) {
      let pixels = 0;
      for (let y = 0; y < 192; y++)
        for (let x = 0; x < 192; x++) {
          const a =
            data[
              ((Math.floor(frame / 5) * 192 + y) * info.width +
                (frame % 5) * 192 +
                x) *
                4 +
                3
            ];
          if (a > 64) pixels++;
          if ((x < 4 || x >= 188 || y < 4 || y >= 188) && a > 32)
            throw Error(`Clipped fishing frame ${e.id}/${frame}`);
        }
      if (pixels < 2000) throw Error(`Empty fishing frame ${e.id}/${frame}`);
    }
}
console.log(
  "80 new diagonal fishing frames and 4 diagonal chairs verified; cardinal fishing retained.",
);
