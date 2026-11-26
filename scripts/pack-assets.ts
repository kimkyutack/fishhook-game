import sharp from "sharp";
import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  stat,
  unlink,
} from "node:fs/promises";
import { FISH } from "../src/shared/catalog";
import { characterRegions } from "./character-regions";
import {
  MOTIONS,
  DIRECTIONS,
  ROOT,
  ROD_ANCHORS,
  ROD_STATES,
} from "../src/client/game/animations";
const entries: Record<string, unknown>[] = [];
async function image(
  source: string,
  target: string,
  opts: {
    cols?: number;
    rows?: number;
    index?: number;
    size?: number;
    kind?: string;
    trim?: boolean;
  } = {},
) {
  const {
    cols = 1,
    rows = 1,
    index = 0,
    size = 256,
    kind = "image",
    trim = false,
  } = opts;
  const path = `art/source/${source}.png`,
    meta = await sharp(path).metadata();
  const left = Math.round(((index % cols) * meta.width!) / cols),
    top = Math.round((Math.floor(index / cols) * meta.height!) / rows);
  const width = Math.round((((index % cols) + 1) * meta.width!) / cols) - left,
    height =
      Math.round(((Math.floor(index / cols) + 1) * meta.height!) / rows) - top;
  let pipeline = sharp(path).extract({ left, top, width, height });
  if (trim)
    pipeline = sharp(await pipeline.png().toBuffer()).trim({ threshold: 15 });
  await mkdir(`public/assets/${target.split("/")[0]}`, { recursive: true });
  await pipeline
    .resize(size, size, {
      fit: kind === "fish" ? "inside" : "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({
      compressionLevel: 9,
      palette: true,
      quality: 90,
      effort: 8,
      dither: 0,
    })
    .toFile(`public/assets/${target}.png`);
  const packed = await sharp(`public/assets/${target}.png`).metadata();
  entries.push({
    id: target.split("/").at(-1),
    kind,
    status: "ready",
    source: path,
    runtime: `public/assets/${target}.png`,
    width: packed.width,
    height: packed.height,
    sourceRegion: { left, top, width, height },
    loop: false,
    layers: [kind],
    root: ROOT,
    grip: { x: 0.25, y: 0.8 },
    rodTip: { x: 0.85, y: 0.15 },
  });
}
for (let s = 1; s <= 5; s++)
  for (let i = 0; i < 10; i++)
    await image(`cuteFish${s}`, `fish/${FISH[(s - 1) * 10 + i].id}`, {
      cols: 5,
      rows: 2,
      index: i,
      kind: "fish",
      trim: true,
    });
for (const g of ["male", "female"])
  for (const d of DIRECTIONS) {
    const source = `${g}_${d}`,
      path = `art/source/${source}.png`,
      meta = await sharp(path).metadata();
    const regions = await characterRegions(path);
    // One scale per direction, with standing height matched across all eight sheets.
    // Never resize individual poses to their bounding box (that makes limbs/body pulse).
    const scale = Math.min(
      158 / regions[0].height,
      178 / Math.max(...regions.map((r) => r.height)),
    );
    const frames = [];
    for (let i = 0; i < 40; i++) {
      const r = regions[i];
      const figure = await sharp(path)
        .extract({ left: r.left, top: r.top, width: r.width, height: r.height })
        .resize(Math.round(r.width * scale), Math.round(r.height * scale))
        .png()
        .toBuffer();
      const body = await sharp({
        create: {
          width: 188,
          height: 188,
          channels: 4,
          background: "#00000000",
        },
      })
        .composite([
          {
            input: figure,
            left: Math.round(94 - (r.headX - r.left) * scale),
            top: 178 - Math.round(r.height * scale),
          },
        ])
        .png()
        .toBuffer();
      const extruded = await sharp(body)
        .extend({ top: 1, bottom: 1, left: 1, right: 1, extendWith: "copy" })
        .png()
        .toBuffer();
      const buf = await sharp(extruded)
        .extend({
          top: 1,
          bottom: 1,
          left: 1,
          right: 1,
          background: "#00000000",
        })
        .png()
        .toBuffer();
      frames.push({
        input: buf,
        left: (i % 8) * 192,
        top: Math.floor(i / 8) * 192,
      });
    }
    await sharp({
      create: {
        width: 1536,
        height: 960,
        channels: 4,
        background: "#00000000",
      },
    })
      .composite(frames)
      .png({
        compressionLevel: 9,
        palette: true,
        quality: 90,
        effort: 8,
        dither: 0,
      })
      .toFile(`public/assets/characters/${source}.png`);
    const metadata = Object.entries(MOTIONS).flatMap(([motion, v]) =>
      Array.from({ length: v.count }, (_, f) => ({
        key: `${source}_${motion}_${f}`,
        frame: v.start + f,
        ms: Math.round(1000 / v.fps),
        root: ROOT,
        gripAnchor: {
          x: d === "left" ? 0.35 : d === "right" ? 0.65 : 0.6,
          y: 0.65,
        },
        rodTipAnchor: {
          x: d === "left" ? 0.05 : d === "right" ? 0.95 : 0.6,
          y: d === "down" ? 0.95 : 0.2,
        },
        handOcclusion: d === "up" ? "body-over-rod" : "rod-over-body",
        motion,
      })),
    );
    entries.push({
      id: source,
      kind: "character-atlas",
      status: "ready",
      source: path,
      runtime: `public/assets/characters/${source}.png`,
      width: 1536,
      height: 960,
      frameWidth: 192,
      frameHeight: 192,
      frameCount: 39,
      padding: 1,
      extrusion: 1,
      registration: { method: "intact-figure-bounds", scale, regions },
      sourceSize: { width: meta.width, height: meta.height },
      frames: metadata,
      root: ROOT,
      layers: ["shadow", "chair", "body", "rod", "fish"],
      loop: "per-motion",
    });
    if (d === "down") {
      const r = regions[0];
      await sharp(path)
        .extract({ left: r.left, top: r.top, width: r.width, height: r.height })
        .resize(256, 256, { fit: "contain", background: "#00000000" })
        .png({ palette: true, quality: 90 })
        .toFile(`public/assets/characters/${g}_portrait.png`);
      entries.push({
        id: `${g}_portrait`,
        kind: "portrait",
        status: "ready",
        source: path,
        runtime: `public/assets/characters/${g}_portrait.png`,
        width: 256,
        height: 256,
        sourceRegion: r,
      });
    }
  }
for (const [i, key] of ["grass", "stone", "water", "wood"].entries())
  if (key !== "water")
    await image("tiles", `world/${key}`, {
      cols: 2,
      rows: 2,
      index: i,
      size: 512,
      kind: "tile",
    });
await image("water", "world/water", { size: 512, kind: "tile" });
for (const [i, key] of [
  "tree",
  "rock",
  "stall",
  "npc",
  "flowers",
  "reeds",
  "lily",
  "dock",
].entries())
  await image("objects", `world/${key}`, {
    cols: 4,
    rows: 2,
    index: i,
    size: key === "stall" ? 384 : 256,
    kind: "world-object",
  });
// Split the existing painted stall into back and counter layers without changing its canvas or root.
for (const [id, top, height] of [
  ["stall_back", 0, 240],
  ["stall_front", 240, 144],
] as const) {
  await sharp("public/assets/world/stall.png")
    .extract({ left: 0, top, width: 384, height })
    .extend({
      top,
      bottom: 384 - top - height,
      left: 0,
      right: 0,
      background: "#00000000",
    })
    .png({ palette: true, quality: 90 })
    .toFile(`public/assets/world/${id}.png`);
  entries.push({
    id,
    kind: "world-layer",
    status: "ready",
    source: "art/source/objects.png",
    runtime: `public/assets/world/${id}.png`,
    width: 384,
    height: 384,
    root: { x: 0.5, y: 0.88 },
    layers: [id],
    loop: false,
  });
}
await unlink("public/assets/world/stall.png");
entries.splice(
  entries.findIndex((e) => e.id === "stall"),
  1,
);
for (const [i, key] of [
  "rod_1",
  "rod_2",
  "rod_3",
  "worm",
  "mix",
  "live",
  "special",
  "coin",
  "chair_down",
  "chair_up",
  "chair_left",
  "chair_right",
  "star",
  "charge",
  "bag",
  "shop",
  "lock",
  "close",
  "bobber",
  "shadow",
  "line",
  "target",
  "speaker",
  "settings",
].entries())
  await image("equipment", `equipment/${key}`, {
    cols: 6,
    rows: 4,
    index: i,
    kind: "equipment",
  });
for (const rod of [1, 2, 3])
  for (const [row, state] of ROD_STATES.entries())
    for (const [col, direction] of (
      ["up", "down", "left", "right"] as const
    ).entries()) {
      await image(
        `rod_${rod}_poses`,
        `equipment/rod_${rod}_${direction}_${state}`,
        {
          cols: 4,
          rows: 4,
          index: row * 4 + col,
          kind: "directional-equipment",
        },
      );
      const entry = entries.at(-1)!;
      entry.grip = ROD_ANCHORS[direction].grip;
      entry.rodTip = ROD_ANCHORS[direction].tip;
      entry.layers = ["body", "rod", "hand"];
    }
for (const key of [
  "panel",
  "primary",
  "button",
  "pressed",
  "disabled",
  "speech",
])
  if (key === "pressed")
    await image("ui", `ui/${key}`, {
      cols: 2,
      rows: 3,
      index: 3,
      kind: "ui-nine-slice",
      trim: true,
    });
  else
    await image(`ui_${key}`, `ui/${key}`, {
      kind: "ui-nine-slice",
      trim: true,
    });
const lineBuffer = await sharp("public/assets/equipment/line.png")
  .trim({ threshold: 20 })
  .png()
  .toBuffer();
await sharp(lineBuffer)
  .resize({ height: 256 })
  .png()
  .toFile("public/assets/equipment/line-visible.png");
const lineMeta = await sharp(
  "public/assets/equipment/line-visible.png",
).metadata();
await copyFile(
  "public/assets/equipment/line-visible.png",
  "public/assets/equipment/line.png",
);
await unlink("public/assets/equipment/line-visible.png");
const lineEntry = entries.find((e) => e.id === "line")!;
lineEntry.width = lineMeta.width;
lineEntry.height = lineMeta.height;
const fxmeta = await sharp("art/source/fx.png").metadata();
const effects = [];
for (let i = 0; i < 12; i++) {
  const left = Math.round(((i % 4) * fxmeta.width!) / 4),
    top = Math.round((Math.floor(i / 4) * fxmeta.height!) / 3),
    width = Math.round((((i % 4) + 1) * fxmeta.width!) / 4) - left,
    height = Math.round(((Math.floor(i / 4) + 1) * fxmeta.height!) / 3) - top;
  effects.push({
    input: await sharp("art/source/fx.png")
      .extract({ left, top, width, height })
      .resize(188, 188, { fit: "contain", background: "#00000000" })
      .extend({ top: 2, bottom: 2, left: 2, right: 2, background: "#00000000" })
      .png()
      .toBuffer(),
    left: (i % 4) * 192,
    top: Math.floor(i / 4) * 192,
  });
}
await sharp({
  create: { width: 768, height: 576, channels: 4, background: "#00000000" },
})
  .composite(effects)
  .png()
  .toFile("public/assets/fx/effects.png");
entries.push({
  id: "effects",
  kind: "fx-atlas",
  status: "ready",
  source: "art/source/fx.png",
  runtime: "public/assets/fx/effects.png",
  width: 768,
  height: 576,
  frameCount: 12,
  frameMs: 100,
  loop: true,
});
await image("shore", "world/shore", { size: 384, kind: "shore-nine-slice" });
await sharp("art/source/cuteRef.png")
  .extract({ left: 0, top: 0, width: 1671, height: 590 })
  .resize(1671, 590)
  .png()
  .toFile("public/assets/world/welcome.png");
entries.push({
  id: "welcome",
  kind: "background",
  status: "ready",
  source: "art/source/cuteRef.png",
  runtime: "public/assets/world/welcome.png",
  width: 1671,
  height: 590,
});
const bytes = await Promise.all(
  entries.map(async (e) => (await stat(String(e.runtime))).size),
);
await writeFile(
  "art/manifest.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      generator: "built-in image_gen",
      notes:
        "Two-head chibi direction supersedes original 2.7-head specification. Atlas frames use fixed scale; 2px padding. No placeholder assets counted as ready. See docs/art-qa.md for visual review limits.",
      runtimeFiles: entries.length,
      runtimeBytes: bytes.reduce((a, b) => a + b, 0),
      entries,
    },
    null,
    2,
  ),
);
await writeFile(
  "public/assets/manifest.json",
  JSON.stringify({ frames: MOTIONS, root: ROOT }),
);
console.log(
  `Packed ${entries.length} runtime PNG files, ${(bytes.reduce((a, b) => a + b, 0) / 1024 / 1024).toFixed(2)} MiB`,
);
