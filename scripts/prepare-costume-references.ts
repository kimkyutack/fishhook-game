import sharp from "sharp";
import { mkdir } from "node:fs/promises";
await mkdir("art/references/costume-fit", { recursive: true });
async function frame(path: string, n: number, cols: number) {
  return sharp(path)
    .extract({
      left: (n % cols) * 192,
      top: Math.floor(n / cols) * 192,
      width: 192,
      height: 192,
    })
    .png()
    .toBuffer();
}
for (const gender of ["male", "female"])
  for (const kind of ["locomotion", "fishing", "action"]) {
    const tiles = [];
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 8; col++) {
        const dir = ["down", "up", "right"][row],
          card = `public/assets/characters/${gender}_${dir}.png`;
        let path = card,
          n = 0,
          cols = 8;
        if (kind === "locomotion") {
          if (row < 3) n = [0, 2, 3, 5, 6, 30, 33, 36][col];
          else if (col === 0 || col === 7) {
            path = `public/assets/redesign/${gender}_fishing_diagonal.png`;
            cols = 5;
            n = (row - 3) * 20 + (col === 0 ? 0 : 16);
          } else {
            path = `public/assets/redesign/${gender}_diagonal.png`;
            cols = 6;
            n = (row - 3) * 6 + [0, 0, 1, 3, 4, 2, 5, 0][col];
          }
        } else if (kind === "fishing") {
          if (row < 3) n = [8, 11, 13, 15, 17, 18, 20, 22][col];
          else {
            path = `public/assets/redesign/${gender}_fishing_diagonal.png`;
            cols = 5;
            n = (row - 3) * 20 + [1, 3, 5, 7, 9, 10, 12, 14][col];
          }
        } else {
          if (col < 3) {
            n = [24, 26, 29][col];
            if (row >= 3) {
              path = `public/assets/characters/${gender}_right.png`;
            }
          } else {
            path = `public/assets/redesign/${gender}_fall.png`;
            cols = 6;
            n = [0, 1, 3, 5, 7][row] * 6 + [0, 1, 2, 4, 5][col - 3];
          }
        }
        tiles.push({
          input: await frame(path, n, cols),
          left: col * 192,
          top: row * 192,
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
      .composite(tiles)
      .png()
      .toFile(`art/references/costume-fit/${gender}-${kind}.png`);
  }
