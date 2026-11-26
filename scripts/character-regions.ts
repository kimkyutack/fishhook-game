import sharp from "sharp";

export interface CharacterRegion {
  left: number;
  top: number;
  width: number;
  height: number;
  headX: number;
}

// Generated sheets have 40 figures, but their painted bounds are not an exact grid.
// Locate each intact figure before extracting it, instead of cutting a neighbour's hair.
// This registers existing artwork; no pixels are repainted or generated here.
export async function characterRegions(path: string, columns = 8, rows = 5) {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const seen = new Uint8Array(w * h),
    queue = new Int32Array(w * h);
  const regions: CharacterRegion[] = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || data[i * 4 + 3] < 64) continue;
    let head = 0,
      tail = 1,
      left = w,
      top = h,
      right = 0,
      bottom = 0;
    queue[0] = i;
    seen[i] = 1;
    while (head < tail) {
      const n = queue[head++],
        x = n % w,
        y = Math.floor(n / w);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      for (const m of [
        x ? n - 1 : -1,
        x < w - 1 ? n + 1 : -1,
        y ? n - w : -1,
        y < h - 1 ? n + w : -1,
      ]) {
        if (m < 0 || seen[m] || data[m * 4 + 3] < 64) continue;
        seen[m] = 1;
        queue[tail++] = m;
      }
    }
    if (tail < (w * h) / 400) continue;
    let headLeft = w,
      headRight = 0;
    for (let j = 0; j < tail; j++) {
      const n = queue[j],
        x = n % w,
        y = Math.floor(n / w);
      if (y > top + (bottom - top) * 0.45) continue;
      headLeft = Math.min(headLeft, x);
      headRight = Math.max(headRight, x);
    }
    regions.push({
      left,
      top,
      width: right - left + 1,
      height: bottom - top + 1,
      headX: (headLeft + headRight) / 2,
    });
  }
  const expected = columns * rows;
  if (regions.length !== expected)
    throw Error(
      `${path}: expected ${expected} intact figures, found ${regions.length}`,
    );
  // Row assignment follows figure centre, so the last row can extend outside a nominal cell.
  regions.sort((a, b) => a.top + a.height / 2 - b.top - b.height / 2);
  return Array.from({ length: rows }, (_, row) =>
    regions
      .slice(row * columns, row * columns + columns)
      .sort((a, b) => a.headX - b.headX),
  ).flat();
}
