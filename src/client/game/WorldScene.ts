import Phaser from "phaser";
import {
  MAP,
  SPOTS,
  move,
  fishingSpot,
  vectors,
  type Direction,
} from "../../config/map";
import { BALANCE } from "../../config/balance";
import { FISH } from "../../shared/catalog";
import { actionFor, motionBusy } from "../../shared/interaction";
import type { PublicPlayer, Event } from "../../shared/protocol";
import { gameStore, connection, serverTime } from "../network/store";
import {
  MOTIONS,
  DIRECTIONS,
  ROOT,
  ROD_ANCHORS,
  ROD_STATES,
  visibleMotion,
  grip,
} from "./animations";
const base = import.meta.env.VITE_ASSET_BASE || "/assets";
interface Actor {
  body: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  chair: Phaser.GameObjects.Image;
  rod: Phaser.GameObjects.Image;
  line: Phaser.GameObjects.Image;
  bobber: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  target: Phaser.GameObjects.Image;
  state: PublicPlayer;
  samples: { t: number; x: number; y: number }[];
  shownEvent: number;
  escape?: {
    at: number;
    from: { x: number; y: number };
    to: { x: number; y: number };
    kickDirection: Direction;
  };
}
export class WorldScene extends Phaser.Scene {
  actors = new Map<string, Actor>();
  keys = new Set<string>();
  blocked = false;
  lastSend = 0;
  lastInput = "";
  direction: Direction = "down";
  prediction: { x: number; y: number } | null = null;
  unsubscribe?: () => void;
  ripples: Phaser.GameObjects.Sprite[] = [];
  debug!: Phaser.GameObjects.Graphics;
  lastEvent: Event | null = null;
  onReady = () => {};
  primary = () => {};
  inventory = () => {};
  closeModal = () => {};
  profile = (id: string) => {};
  constructor() {
    super("world");
  }
  preload() {
    for (const g of ["male", "female"])
      for (const d of DIRECTIONS)
        this.load.spritesheet(`${g}_${d}`, `${base}/characters/${g}_${d}.png`, {
          frameWidth: 192,
          frameHeight: 192,
        });
    for (const key of [
      "grass",
      "stone",
      "water",
      "wood",
      "tree",
      "rock",
      "stall_back",
      "stall_front",
      "npc",
      "flowers",
      "reeds",
      "lily",
      "dock",
      "shore",
    ])
      this.load.image(key, `${base}/world/${key}.png`);
    for (const key of [
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
    ])
      this.load.image(key, `${base}/equipment/${key}.png`);
    for (const f of FISH) this.load.image(f.id, `${base}/fish/${f.id}.png`);
    for (const rod of [1, 2, 3])
      for (const direction of DIRECTIONS)
        for (const state of ROD_STATES) {
          const key = `rod_${rod}_${direction}_${state}`;
          this.load.image(key, `${base}/equipment/${key}.png`);
        }
    this.load.spritesheet("fx", `${base}/fx/effects.png`, {
      frameWidth: 192,
      frameHeight: 192,
    });
  }
  create() {
    for (const g of ["male", "female"])
      for (const d of DIRECTIONS)
        for (const [m, c] of Object.entries(MOTIONS))
          this.anims.create({
            key: `${g}_${d}_${m}`,
            frames: this.anims.generateFrameNumbers(`${g}_${d}`, {
              start: c.start,
              end: c.start + c.count - 1,
            }),
            frameRate: c.fps,
            repeat: c.loop ? -1 : 0,
          });
    this.cameras.main.setBounds(0, 0, MAP.width, MAP.height);
    this.cameras.main.setZoom(
      Math.max(0.75, Math.min(1.05, this.scale.height / 850)),
    );
    this.add
      .tileSprite(0, 0, MAP.width, MAP.height, "grass")
      .setOrigin(0)
      .setDepth(-1000);
    this.add
      .tileSprite(970, 820, 1460, 280, "stone")
      .setOrigin(0)
      .setDepth(-990);
    this.add
      .tileSprite(1340, 450, 340, 1200, "stone")
      .setOrigin(0)
      .setDepth(-990);
    for (const r of MAP.waters) {
      this.add
        .nineslice(
          r.x + r.w / 2,
          r.y + r.h / 2,
          "shore",
          undefined,
          r.w + 64,
          r.h + 64,
          60,
          60,
          60,
          60,
        )
        .setDepth(-980);
      this.add
        .tileSprite(r.x, r.y, r.w, r.h, "water")
        .setOrigin(0)
        .setDepth(-970);
    }
    const b = MAP.bridge;
    this.add.tileSprite(b.x, b.y, b.w, b.h, "wood").setOrigin(0).setDepth(-960);
    for (const o of MAP.obstacles) {
      const h = o.kind === "tree" ? 235 : o.kind === "stall" ? 210 : 90,
        w = o.kind === "tree" ? 210 : o.kind === "stall" ? 300 : 115;
      const layers =
        o.kind === "stall" ? ["stall_back", "stall_front"] : [o.kind];
      for (const [index, layer] of layers.entries())
        this.add
          .image(o.x + o.w / 2, o.y + o.h, layer)
          .setOrigin(0.5, 0.88)
          .setDisplaySize(w, h)
          .setDepth(o.y + o.h + index);
    }
    const npc = this.add
      .image(MAP.shop.x, MAP.shop.y, "npc")
      .setDisplaySize(120, 120)
      .setOrigin(0.5, 0.88)
      .setDepth(MAP.shop.y);
    this.tweens.add({
      targets: npc,
      y: MAP.shop.y - 2,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
    this.add
      .text(MAP.shop.x, MAP.shop.y - 110, "상점", {
        fontFamily: "sans-serif",
        fontSize: "18px",
        color: "#234e43",
        backgroundColor: "#fff6df",
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setDepth(3000);
    for (let i = 0; i < 44; i++) {
      const x = 120 + ((i * 383) % 2800),
        y = 530 + ((i * 241) % 1400);
      if (
        MAP.waters.some(
          (r) =>
            x > r.x - 50 &&
            x < r.x + r.w + 50 &&
            y > r.y - 50 &&
            y < r.y + r.h + 50,
        )
      )
        continue;
      this.add
        .image(x, y, "flowers")
        .setDisplaySize(70, 70)
        .setOrigin(0.5, 0.9)
        .setDepth(y);
    }
    for (const r of MAP.waters) {
      for (let i = 0; i < 4; i++)
        this.add
          .image(r.x + 80 + (i * (r.w - 140)) / 4, r.y + r.h - 35, "lily")
          .setDisplaySize(75, 75)
          .setDepth(-950);
      this.add
        .image(r.x + r.w - 70, r.y + r.h + 20, "reeds")
        .setDisplaySize(100, 100)
        .setOrigin(0.5, 0.85)
        .setDepth(r.y + r.h + 20);
    }
    this.anims.create({
      key: "ripples",
      frames: this.anims.generateFrameNumbers("fx", { start: 0, end: 3 }),
      frameRate: 5,
      repeat: -1,
    });
    for (const r of MAP.waters)
      for (let i = 0; i < 4; i++) {
        this.ripples.push(
          this.add
            .sprite(r.x + 70 + ((r.w - 140) * i) / 4, r.y + r.h * 0.4, "fx", 0)
            .setDisplaySize(110, 80)
            .setDepth(-955)
            .setAlpha(0.28)
            .play({ key: "ripples", delay: i * 100 }),
        );
      }
    this.debug = this.add.graphics().setDepth(10000);
    if (new URLSearchParams(location.search).has("debug")) {
      this.debug.lineStyle(2, 0xdd4545, 0.8);
      for (const r of [...MAP.waters, ...MAP.obstacles])
        this.debug.strokeRect(r.x, r.y, r.w, r.h);
      for (const s of SPOTS) {
        this.debug.lineStyle(1, 0x2255ee, 0.5);
        this.debug.strokeCircle(s.x, s.y, 8);
        this.debug.lineBetween(s.x, s.y, s.water.x, s.water.y);
      }
    }
    const keydown = (e: KeyboardEvent) => {
      if (
        this.blocked ||
        /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName)
      )
        return;
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)
      )
        e.preventDefault();
      if (e.key.startsWith("Arrow")) {
        this.keys.add(e.key);
        this.direction = (
          {
            ArrowUp: "up",
            ArrowDown: "down",
            ArrowLeft: "left",
            ArrowRight: "right",
          } as const
        )[e.key as "ArrowUp"];
      }
      if (e.repeat) return;
      if (e.key === " ") this.primary();
      if (e.key.toLowerCase() === "i") this.inventory();
      if (e.key.toLowerCase() === "c") connection.command({ type: "sit" });
      if (e.key === "Escape") connection.command({ type: "cancel" });
    };
    const keyup = (e: KeyboardEvent) => this.keys.delete(e.key);
    const release = () => {
      this.keys.clear();
      connection.move(0, 0, this.direction);
      this.lastInput = "";
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    this.unsubscribe = gameStore.subscribe(() => this.receive());
    this.receive();
    this.onReady();
    this.events.once("shutdown", () => {
      this.unsubscribe?.();
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
    });
  }
  receive() {
    const s = gameStore.get(),
      now = performance.now();
    const ids = new Set(s.players.map((p) => p.id));
    for (const [id, a] of this.actors)
      if (!ids.has(id)) {
        Object.values(a).forEach((v) => {
          if (v instanceof Phaser.GameObjects.GameObject) v.destroy();
        });
        this.actors.delete(id);
      }
    for (const p of s.players) {
      let a = this.actors.get(p.id);
      if (!a) {
        a = {
          body: this.add
            .sprite(p.x, p.y, `${p.gender}_${p.direction}`, 0)
            .setOrigin(ROOT.x, ROOT.y)
            .setDisplaySize(136, 136)
            .setInteractive({ useHandCursor: true }),
          shadow: this.add.image(p.x, p.y, "shadow").setDisplaySize(64, 25),
          chair: this.add
            .image(p.x, p.y, "chair_down")
            .setDisplaySize(100, 100)
            .setOrigin(0.5, 0.8),
          rod: this.add
            .image(p.x, p.y, "rod_1")
            .setOrigin(0.18, 0.84)
            .setDisplaySize(72, 72),
          line: this.add.image(0, 0, "line").setOrigin(0.5, 0),
          bobber: this.add.image(0, 0, "bobber").setDisplaySize(25, 25),
          name: this.add
            .text(p.x, p.y, p.name, {
              fontFamily: "sans-serif",
              fontSize: "15px",
              fontStyle: "bold",
              color: "#254439",
              stroke: "#fffaf0",
              strokeThickness: 4,
            })
            .setOrigin(0.5),
          target: this.add.image(p.x, p.y, "target").setDisplaySize(34, 34),
          state: p,
          samples: [],
          shownEvent: 0,
        };
        a.body.on("pointerdown", () => this.profile(p.id));
        this.actors.set(p.id, a);
      }
      const changedSeq = a.state.seq !== p.seq;
      a.state = p;
      a.samples.push({ t: now, x: p.x, y: p.y });
      if (a.samples.length > 8) a.samples.shift();
      if (p.id === s.self?.id) {
        if (
          !this.prediction ||
          (!this.keys.size && changedSeq) ||
          p.castStartedAt !== undefined
        )
          this.prediction = { x: p.x, y: p.y };
        else if (
          changedSeq &&
          Math.hypot(this.prediction.x - p.x, this.prediction.y - p.y) > 65
        )
          this.prediction = { x: p.x, y: p.y };
      }
    }
    if (s.event && s.event !== this.lastEvent) {
      this.lastEvent = s.event;
      this.effect(s.event);
    }
  }
  effect(e: Event) {
    if (e.type === "caught") {
      const a = this.actors.get(e.playerId);
      if (!a) return;
      const img = this.add
        .image(a.state.x, a.state.y - 140, e.fishId)
        .setDisplaySize(100, 100)
        .setDepth(8000);
      this.tweens.add({
        targets: img,
        y: img.y - 45,
        alpha: 0,
        delay: 1800,
        duration: 900,
        onComplete: () => img.destroy(),
      });
      for (let i = 0; i < FISH.find((f) => f.id === e.fishId)!.star; i++) {
        const star = this.add
          .image(a.state.x - 28 + i * 15, a.state.y - 95, "star")
          .setDisplaySize(18, 18)
          .setDepth(8000);
        this.time.delayedCall(2600, () => star.destroy());
      }
    } else {
      const a = this.actors.get(e.attacker),
        t = this.actors.get(e.target);
      if (a)
        a.escape = {
          at: e.at,
          from: e.from,
          to: e.to,
          kickDirection: a.state.direction,
        };
      if (t) {
        const fx = this.add
          .sprite(t.state.x, t.state.y - 30, "fx", 8)
          .setDisplaySize(90, 90)
          .setDepth(t.state.y + 10);
        this.time.delayedCall(350, () => {
          let f = 8;
          const timer = this.time.addEvent({
            delay: 80,
            repeat: 3,
            callback: () => {
              if (f < 12) fx.setFrame(f++);
              else fx.destroy();
            },
          });
          this.time.delayedCall(400, () => {
            timer.remove();
            fx.destroy();
          });
        });
      }
    }
  }
  update(_time: number, delta: number) {
    const s = gameStore.get(),
      now = serverTime();
    let dx = 0,
      dy = 0;
    const me = this.actors.get(s.self?.id ?? "");
    if (!this.blocked && s.status === "online") {
      dx =
        Number(this.keys.has("ArrowRight")) -
        Number(this.keys.has("ArrowLeft"));
      dy =
        Number(this.keys.has("ArrowDown")) - Number(this.keys.has("ArrowUp"));
    }
    const busy = me && motionBusy(me.state, now);
    if (busy) {
      dx = 0;
      dy = 0;
    }
    if (me && this.prediction && (dx || dy)) {
      const n = Math.max(1, Math.hypot(dx, dy));
      this.prediction = move(
        this.prediction,
        ((dx / n) * BALANCE.speed * Math.min(delta, 50)) / 1000,
        ((dy / n) * BALANCE.speed * Math.min(delta, 50)) / 1000,
      );
    }
    if (dx && !dy) this.direction = dx > 0 ? "right" : "left";
    if (dy && !dx) this.direction = dy > 0 ? "down" : "up";
    const input = `${dx},${dy},${this.direction}`;
    if (
      s.status === "online" &&
      ((performance.now() - this.lastSend >= 100 && (dx || dy)) ||
        input !== this.lastInput)
    ) {
      connection.move(dx, dy, this.direction);
      this.lastSend = performance.now();
      this.lastInput = input;
    }
    const action = actionFor(me?.state, s.players, now);
    for (const [id, a] of this.actors) {
      let x = a.state.x,
        y = a.state.y;
      const self = id === s.self?.id;
      if (self && this.prediction) {
        x = this.prediction.x;
        y = this.prediction.y;
      } else {
        const time = performance.now() - 100,
          arr = a.samples;
        const right = arr.findIndex((t) => t.t >= time);
        if (right > 0) {
          const l = arr[right - 1],
            r = arr[right],
            f = Phaser.Math.Clamp((time - l.t) / (r.t - l.t || 1), 0, 1);
          x = Phaser.Math.Linear(l.x, r.x, f);
          y = Phaser.Math.Linear(l.y, r.y, f);
        } else if (arr.length) {
          x = arr[arr.length - 1].x;
          y = arr[arr.length - 1].y;
        }
      }
      if (a.escape) {
        const age = now - a.escape.at,
          f = Phaser.Math.Clamp((age - 450) / 600, 0, 1);
        x = Phaser.Math.Linear(a.escape.from.x, a.escape.to.x, f);
        y = Phaser.Math.Linear(a.escape.from.y, a.escape.to.y, f);
        if (age > 1050) {
          a.escape = undefined;
          if (self) this.prediction = { x, y };
        }
      }
      let motion = visibleMotion(a.state.motion, now - a.state.stateAt);
      let direction = a.state.direction;
      if (a.escape && now - a.escape.at < 450)
        direction = a.escape.kickDirection;
      if (self && (dx || dy) && !busy) {
        motion = "walk";
        direction = this.direction;
      }
      a.body.setPosition(x, y).setDepth(y + 1);
      const anim = `${a.state.gender}_${direction}_${motion}`;
      a.body.play(anim, true);
      a.shadow.setPosition(x, y).setDepth(y - 3);
      a.name.setPosition(x, y - 119).setDepth(y + 200);
      a.name.setAlpha(a.state.online ? 1 : 0.6);
      const seated = [
        "seated_idle",
        "sit_down",
        "cast",
        "fishing_wait",
        "reel_in",
        "startled",
      ].includes(motion);
      a.chair
        .setVisible(seated)
        .setTexture(`chair_${direction}`)
        .setPosition(
          x + (direction === "left" ? 10 : direction === "right" ? -10 : 0),
          y + 12,
        )
        .setDepth(direction === "up" ? y + 3 : y - 1);
      a.target
        .setVisible(action.type === "sabotage" && action.target === id)
        .setPosition(x, y - 145)
        .setDepth(8000);
      const fishing = a.state.castStartedAt !== undefined;
      const rodVisible =
        fishing ||
        motion === "startled" ||
        (motion === "reel_in" && now - a.state.stateAt < 450);
      a.rod.setVisible(rodVisible);
      a.line.setVisible(fishing);
      a.bobber.setVisible(fishing);
      if (rodVisible) {
        const anchor = grip(
          direction,
          motion,
          Math.max(0, Number(a.body.frame.name) - MOTIONS[motion].start),
        );
        const rodState =
          motion === "startled"
            ? now - a.state.stateAt < 350
              ? "kicked"
              : "recover"
            : motion === "cast"
              ? "bent"
              : motion === "reel_in"
                ? "recover"
                : "normal";
        const pose = ROD_ANCHORS[direction];
        a.rod
          .setTexture(`rod_${a.state.rod}_${direction}_${rodState}`)
          .setOrigin(pose.grip.x, pose.grip.y)
          .setDisplaySize(72, 72)
          .setPosition(x + anchor.x, y + anchor.y)
          .setDepth(direction === "up" ? y : y + 3);
        a.rod.setAngle(
          motion === "startled"
            ? Math.sin((now - a.state.stateAt) / 70) * 40
            : 0,
        );
        if (motion === "startled")
          a.rod.setY(
            a.rod.y -
              Math.sin(Math.min(1, (now - a.state.stateAt) / 650) * Math.PI) *
                38,
          );
        const spot = fishingSpot(a.state);
        if (spot) {
          const end = spot.water;
          const rotation = a.rod.rotation;
          const tx = 72 * (pose.tip.x - pose.grip.x),
            ty = 72 * (pose.tip.y - pose.grip.y);
          const tip = {
            x: a.rod.x + tx * Math.cos(rotation) - ty * Math.sin(rotation),
            y: a.rod.y + tx * Math.sin(rotation) + ty * Math.cos(rotation),
          };
          a.line
            .setPosition(tip.x, tip.y)
            .setDisplaySize(2, Math.hypot(end.x - tip.x, end.y - tip.y))
            .setRotation(Math.atan2(end.y - tip.y, end.x - tip.x) - Math.PI / 2)
            .setDepth(y);
          a.bobber
            .setPosition(end.x, end.y + Math.sin(now / 350) * 2)
            .setDepth(-900);
        }
      }
    }
    if (me) {
      const p = this.prediction ?? me.state;
      this.cameras.main.centerOn(p.x, p.y - 70);
    }
  }
}
