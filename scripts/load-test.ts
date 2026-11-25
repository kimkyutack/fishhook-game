import WebSocket from "ws";
import { writeFile } from "node:fs/promises";
const base = process.env.TEST_BASE || "http://127.0.0.1:8788";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw Error("Local load tests only");
const prefix = `L${Date.now().toString(36).slice(-6)}`;
const clients: {
  ws: WebSocket;
  seq: number;
  sent: number;
  received: number;
}[] = [];
const latencies: number[] = [];
let errors = 0,
  bytes = 0;
async function account(i: number) {
  const r = await fetch(`${base}/api/register`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `${prefix}_${i}`,
      gender: i % 2 ? "female" : "male",
    }),
  });
  if (!r.ok) throw Error(`Registration ${r.status}`);
  return r.headers.get("set-cookie")!.split(";")[0];
}
for (let i = 0; i < 50; i++) {
  const cookie = await account(i);
  const ws = new WebSocket(base.replace("http", "ws") + "/ws", {
    headers: { Cookie: cookie, Origin: base },
  });
  const c = { ws, seq: 0, sent: 0, received: 0 };
  clients.push(c);
  ws.on("message", (raw) => {
    bytes += Buffer.byteLength(raw.toString());
    c.received++;
    const m = JSON.parse(raw.toString());
    if (m.type === "pong") latencies.push(Date.now() - c.sent);
    if (m.type === "error") errors++;
  });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
const extraCookie = await account(50);
const fullStatus = await new Promise<number>((resolve) => {
  const w = new WebSocket(base.replace("http", "ws") + "/ws", {
    headers: { Cookie: extraCookie, Origin: base },
  });
  w.on("unexpected-response", (_, r) => {
    resolve(r.statusCode ?? 0);
    r.resume();
  });
  w.on("error", () => {});
  w.on("open", () => {
    w.close();
    resolve(101);
  });
});
const start = Date.now();
const timer = setInterval(() => {
  const phase = Math.floor((Date.now() - start) / 2000) % 2;
  for (const [i, c] of clients.entries()) {
    c.ws.send(
      JSON.stringify({
        type: "move",
        seq: ++c.seq,
        dx: phase ? -1 : 1,
        dy: 0,
        direction: phase ? "left" : "right",
      }),
    );
    if (c.seq % 10 === 0) {
      c.sent = Date.now();
      c.ws.send(JSON.stringify({ type: "ping" }));
    }
  }
}, 100);
await new Promise((r) => setTimeout(r, 30000));
clearInterval(timer);
latencies.sort((a, b) => a - b);
const result = {
  at: new Date().toISOString(),
  runtime: "local Wrangler/workerd, same machine, no browser rendering",
  clients: clients.length,
  durationSeconds: (Date.now() - start) / 1000,
  sentMoves: clients.reduce((n, c) => n + c.seq, 0),
  receivedMessages: clients.reduce((n, c) => n + c.received, 0),
  errors,
  openAtEnd: clients.filter((c) => c.ws.readyState === 1).length,
  capacity51stStatus: fullStatus,
  pingMedianMs: latencies[Math.floor(latencies.length * 0.5)],
  pingP95Ms: latencies[Math.floor(latencies.length * 0.95)],
  receivedMiB: bytes / 1024 / 1024,
};
for (const c of clients) c.ws.close();
await writeFile("docs/load-test.json", JSON.stringify(result, null, 2));
console.log(result);
if (errors || result.openAtEnd !== 50 || fullStatus !== 503)
  process.exitCode = 1;
