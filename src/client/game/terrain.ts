import type Phaser from "phaser";
import { MAP } from "../../config/map";
export const TERRAIN_ATLAS_KEY = "terrain-continuous";
export const TERRAIN_FRAME_WIDTH = 1536;
export const TERRAIN_FRAME_HEIGHT = 1024;
export function loadContinuousTerrain(scene: Phaser.Scene, base: string) {
  scene.load.spritesheet(
    TERRAIN_ATLAS_KEY,
    `${base}/redesign/terrain-continuous.webp`,
    {
      frameWidth: TERRAIN_FRAME_WIDTH,
      frameHeight: TERRAIN_FRAME_HEIGHT,
    },
  );
}
export function drawContinuousTerrain(scene: Phaser.Scene) {
  if (!scene.textures.exists(TERRAIN_ATLAS_KEY)) return [];
  // Four opaque frames share one continuous encoded source; no seam fades.
  return Array.from({ length: 4 }, (_, i) =>
    scene.add
      .image(
        ((i % 2) * MAP.width) / 2,
        (Math.floor(i / 2) * MAP.height) / 2,
        TERRAIN_ATLAS_KEY,
        i,
      )
      .setOrigin(0)
      .setDisplaySize(MAP.width / 2, MAP.height / 2)
      .setDepth(-999),
  );
}
