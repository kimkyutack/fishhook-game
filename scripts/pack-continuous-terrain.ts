import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const width = 3072,
  height = 2048;
const root = "art/source/terrain-continuity";
const baseline = await readFile(
  "art/references/terrain-continuity/joined-before.png",
);
const original = await sharp(baseline).removeAlpha().raw().toBuffer();
const pixels = Buffer.from(original),
  touched = new Uint8Array(width * height);
const regions: {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  orientation: string;
}[] = JSON.parse(
  await readFile("art/references/terrain-continuity/regions.json", "utf8"),
);
const passes: Record<string, unknown>[] = [];
// Bake reconstructed gradients into one opaque image. This is an offline
// screened-Poisson solve, not a runtime alpha fade between misaligned objects.
for (const r of regions) {
  const source = `${root}/${r.id}.png`,
    bytes = await readFile(source);
  const meta = await sharp(bytes).metadata();
  if (Math.abs(meta.width! / meta.height! - r.w / r.h) / (r.w / r.h) > 0.01)
    throw Error(`Wrong repair framing: ${r.id}`);
  const guide = await sharp(bytes)
    .resize(r.w, r.h, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();
  let magenta = 0;
  for (let i = 0; i < guide.length; i += 3)
    if (guide[i] > 220 && guide[i + 1] < 40 && guide[i + 2] > 220) magenta++;
  if (magenta > 100) throw Error(`Unfilled mask: ${r.id}`);
  const vertical = r.orientation === "vertical";
  const left = vertical ? r.x + 128 : Math.max(0, r.x + 1);
  const top = vertical ? Math.max(0, r.y + 1) : r.y + 128;
  const right = vertical ? r.x + 256 : Math.min(width, r.x + r.w - 1);
  const bottom = vertical ? Math.min(height, r.y + r.h - 1) : r.y + 256;
  // Keep the world image's outermost edge inside the domain too.
  const x0 = r.x === 0 && !vertical ? 0 : left;
  const y0 = r.y === 0 && vertical ? 0 : top;
  const x1 = r.x + r.w === width && !vertical ? width : right;
  const y1 = r.y + r.h === height && vertical ? height : bottom;
  const w = x1 - x0,
    h = y1 - y0,
    field = new Float32Array(w * h * 3),
    rhs = new Float32Array(w * h * 3),
    degree = new Uint8Array(w * h);
  const lambda = 0.04,
    omega = 1.72;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const gx = x0 + x,
        gy = y0 + y,
        idx = y * w + x,
        si = ((gy - r.y) * r.w + gx - r.x) * 3;
      for (let c = 0; c < 3; c++) field[idx * 3 + c] = guide[si + c];
      const values = [
        lambda * guide[si],
        lambda * guide[si + 1],
        lambda * guide[si + 2],
      ];
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const nx = gx + dx,
          ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        degree[idx]++;
        const sx = nx - r.x,
          sy = ny - r.y;
        const qi = (sy * r.w + sx) * 3;
        for (let c = 0; c < 3; c++) {
          let gradient = guide[si + c] - guide[qi + c];
          // Painted water may retain a faint straight color step. Reconstruct
          // its normal gradient from the two adjacent water gradients, without
          // softening real railings, stone edges or foliage silhouettes.
          const blueWater =
            (guide[si] + guide[qi]) / 2 < 150 &&
            guide[si + 2] + guide[qi + 2] > 1.35 * (guide[si] + guide[qi]) &&
            guide[si + 1] + guide[qi + 1] > 140;
          if (blueWater && dx && Math.min(gx, nx) === 1535) {
            const l = ((gy - r.y) * r.w + 1535 - r.x) * 3;
            const delta =
              (guide[l + c] -
                guide[l - 3 + c] +
                guide[l + 6 + c] -
                guide[l + 3 + c]) /
              2;
            gradient = dx > 0 ? -delta : delta;
          } else if (blueWater && dy && Math.min(gy, ny) === 1023) {
            const t = ((1023 - r.y) * r.w + gx - r.x) * 3;
            const delta =
              (guide[t + c] -
                guide[t - r.w * 3 + c] +
                guide[t + r.w * 6 + c] -
                guide[t + r.w * 3 + c]) /
              2;
            gradient = dy > 0 ? -delta : delta;
          }
          values[c] += gradient;
          if (x + dx < 0 || x + dx >= w || y + dy < 0 || y + dy >= h)
            values[c] += pixels[(ny * width + nx) * 3 + c];
        }
      }
      for (let c = 0; c < 3; c++) rhs[idx * 3 + c] = values[c];
    }
  let iterations = 0,
    maxChange = 0;
  for (; iterations < 240; iterations++) {
    maxChange = 0;
    for (let parity = 0; parity < 2; parity++)
      for (let y = 0; y < h; y++)
        for (let x = (y + parity) % 2; x < w; x += 2) {
          const idx = y * w + x,
            k = idx * 3,
            denom = degree[idx] + lambda;
          for (let c = 0; c < 3; c++) {
            let sum = rhs[k + c];
            if (x > 0) sum += field[k - 3 + c];
            if (x + 1 < w) sum += field[k + 3 + c];
            if (y > 0) sum += field[k - w * 3 + c];
            if (y + 1 < h) sum += field[k + w * 3 + c];
            const next = (sum / denom - field[k + c]) * omega;
            field[k + c] += next;
            maxChange = Math.max(maxChange, Math.abs(next));
          }
        }
    if (iterations >= 60 && maxChange < 0.015) break;
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const g = (y0 + y) * width + x0 + x,
        k = (y * w + x) * 3;
      touched[g] = 1;
      for (let c = 0; c < 3; c++)
        pixels[g * 3 + c] = Math.max(
          0,
          Math.min(255, Math.round(field[k + c])),
        );
    }
  passes.push({
    id: r.id,
    source,
    sourceSize: [meta.width, meta.height],
    sourceHash: createHash("sha256").update(bytes).digest("hex"),
    bounds: { x: x0, y: y0, w, h },
    iterations: iterations + 1,
    maxChange,
  });
  console.log(r.id, iterations + 1, maxChange.toFixed(4));
}
let outsideChanged = 0,
  changedPixels = 0,
  touchedPixels = 0;
for (let i = 0; i < touched.length; i++) {
  const differs =
    pixels[i * 3] !== original[i * 3] ||
    pixels[i * 3 + 1] !== original[i * 3 + 1] ||
    pixels[i * 3 + 2] !== original[i * 3 + 2];
  if (touched[i]) touchedPixels++;
  else if (differs) outsideChanged++;
  if (differs) changedPixels++;
}
if (outsideChanged) throw Error("Unrelated terrain changed");
const seamStats = (data: Uint8Array) => {
  const edge = (
    vertical: boolean,
    fixed: number,
    start: number,
    end: number,
  ) => {
    let sum = 0,
      n = 0;
    for (let v = start; v < end; v++) {
      const a =
          (vertical ? v * width + fixed - 1 : (fixed - 1) * width + v) * 3,
        b = (vertical ? v * width + fixed : fixed * width + v) * 3;
      for (let c = 0; c < 3; c++) {
        sum += Math.abs(data[a + c] - data[b + c]);
        n++;
      }
    }
    return sum / n;
  };
  return {
    northVertical: edge(true, 1536, 0, 1024),
    southVertical: edge(true, 1536, 1024, height),
    westHorizontal: edge(false, 1024, 0, 1536),
    eastHorizontal: edge(false, 1024, 1536, width),
  };
};
const master = `${root}/master.png`,
  runtime = "public/assets/redesign/terrain-continuous.webp";
await sharp(pixels, { raw: { width, height, channels: 3 } })
  .png()
  .toFile(master);
await sharp(pixels, { raw: { width, height, channels: 3 } })
  .webp({ quality: 90, effort: 6, smartSubsample: true })
  .toFile(runtime);
await mkdir(`${root}/tiles`, { recursive: true });
const frames = [];
for (const [i, id] of ["nw", "ne", "sw", "se"].entries()) {
  const rect = {
      left: (i % 2) * 1536,
      top: Math.floor(i / 2) * 1024,
      width: 1536,
      height: 1024,
    },
    path = `${root}/tiles/${id}.png`;
  await sharp(master).extract(rect).toFile(path);
  frames.push({ id, path, ...rect });
}
const runtimeBytes = await readFile(runtime);
const manifest = {
  version: 1,
  status: "ready",
  source: master,
  runtime,
  width,
  height,
  frameWidth: 1536,
  frameHeight: 1024,
  frames,
  passes,
  composition:
    "One opaque master, four frames from one encoded atlas; no runtime crossfade",
  solver: {
    method: "screened Poisson gradient reconstruction",
    lambda: 0.04,
    omega: 1.72,
  },
  outsideChanged,
  changedPixels,
  touchedPixels,
  untouchedFraction: 1 - touchedPixels / (width * height),
  seamsBefore: seamStats(original),
  seamsAfter: seamStats(pixels),
  runtimeBytes: runtimeBytes.length,
  runtimeSha256: createHash("sha256").update(runtimeBytes).digest("hex"),
  baselineRuntimeBytes: 3751522,
  textureBytesBefore: 4 * 1536 * 1024 * 4,
  textureBytesAfter: width * height * 4,
  terrainObjectsBefore: 16,
  terrainObjectsAfter: 4,
};
await writeFile(
  "art/terrain-continuity-manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    outsideChanged,
    untouchedFraction: manifest.untouchedFraction,
    runtimeBytes: runtimeBytes.length,
    seamsBefore: manifest.seamsBefore,
    seamsAfter: manifest.seamsAfter,
  }),
);
