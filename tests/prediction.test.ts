import { it, expect } from "vitest";
import { MovementPrediction } from "../src/client/game/prediction";
import { MAP } from "../src/config/map";
it("replays unacknowledged movement under delayed acknowledgements without backwards corrections", () => {
  const p = new MovementPrediction(MAP.spawn);
  let seq = 0;
  const sent: { seq: number; dx: number; dy: number; ms: number }[] = [];
  const send = (dx: number, dy: number, ms: number) => {
    sent.push({ seq: ++seq, dx, dy, ms });
    return seq;
  };
  let server = { ...MAP.spawn },
    applied = 0;
  for (let frame = 0; frame < 120; frame++) {
    p.advance(-1, 0, 16.6667, send);
    if (frame % 11 === 10) {
      for (const input of sent.filter(
        (s) => s.seq > applied && s.seq <= seq - 2,
      )) {
        server = p.integrate(server, input);
        applied = input.seq;
      }
      const before = { ...p.position };
      p.reconcile(server, applied);
      expect(
        Math.hypot(p.position.x - before.x, p.position.y - before.y),
      ).toBeLessThan(0.01);
    }
  }
  p.advance(0, 0, 0, send);
  for (const input of sent.filter((s) => s.seq > applied)) {
    server = p.integrate(server, input);
    applied = input.seq;
  }
  expect(p.reconcile(server, applied)).toEqual(server);
  const final = { ...p.position };
  expect(p.reconcile(MAP.spawn, 0)).toEqual(final);
});
it("does not keep moving after release and resets pending motion on authoritative actions", () => {
  const p = new MovementPrediction(MAP.spawn);
  let seq = 0;
  const send = () => ++seq;
  p.advance(-1, 0, 40, send);
  p.advance(0, 0, 16, send);
  const stop = { ...p.position };
  p.advance(0, 0, 200, send);
  expect(p.position).toEqual(stop);
  p.reset(MAP.spawn);
  expect(p.pending).toHaveLength(0);
  expect(p.tail.ms).toBe(0);
  expect(p.position).toEqual(MAP.spawn);
});
