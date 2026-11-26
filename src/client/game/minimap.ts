import { MAP } from "../../config/map";
export interface MapView {
  x: number;
  y: number;
  width: number;
  height: number;
  playerX: number;
  playerY: number;
}
export function cameraMapView(
  camera: {
    scrollX: number;
    scrollY: number;
    width: number;
    height: number;
    zoom: number;
  },
  player: { x: number; y: number },
): MapView {
  const width = camera.width / camera.zoom,
    height = camera.height / camera.zoom;
  return {
    x: camera.scrollX + camera.width / 2 - width / 2,
    y: camera.scrollY + camera.height / 2 - height / 2,
    width,
    height,
    playerX: player.x,
    playerY: player.y,
  };
}
const clamp = (v: number) => Math.max(0, Math.min(1, v));
export const mapPosition = (x: number, y: number) => ({
  left: `${clamp(x / MAP.width) * 100}%`,
  top: `${clamp(y / MAP.height) * 100}%`,
});
export function mapViewport(v: MapView) {
  const left = clamp(v.x / MAP.width),
    top = clamp(v.y / MAP.height);
  return {
    left: `${left * 100}%`,
    top: `${top * 100}%`,
    width: `${Math.max(0, clamp((v.x + v.width) / MAP.width) - left) * 100}%`,
    height: `${Math.max(0, clamp((v.y + v.height) / MAP.height) - top) * 100}%`,
  };
}
