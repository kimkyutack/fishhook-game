import type { CharacterRegion } from "./character-regions";

// Measure the hair/skin silhouette, excluding yellow hats, red caps and white fur.
// Whole-figure fitting makes the head shrink as soon as a hat is added.
export function costumeHead(
  data: Uint8Array,
  width: number,
  r: CharacterRegion,
) {
  let left = Infinity,
    right = -Infinity;
  for (let y = r.top; y < r.top + r.height * 0.7; y++)
    for (let x = r.left; x < r.left + r.width; x++) {
      const i = (y * width + x) * 4,
        R = data[i],
        G = data[i + 1],
        B = data[i + 2],
        A = data[i + 3];
      if (
        A < 128 ||
        R < 70 ||
        R - G < 20 ||
        G - B < 8 ||
        R > G * 2.3 ||
        R - G < (G - B) * 0.65
      )
        continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  if (!Number.isFinite(left) || right - left < 20)
    throw Error("Cannot register costume head against its base reference");
  return { x: (left + right) / 2, width: right - left + 1 };
}
