import { CHAT_LIFETIME, type ChatMessage } from "../../shared/chat";
import { loadContinuousTerrain, drawContinuousTerrain } from "./terrain";
import { MovementPrediction } from "./prediction";
import { RouteSteering, KeyboardSteering } from "./navigation";
import Phaser from "phaser";
import {
  MAP,
  TRAILS,
  walkingRoute,
  SPOTS,
  move,
  fishingSpot,
  vectors,
  type Direction,
} from "../../config/map";
import { BALANCE } from "../../config/balance";
import { FISH } from "../../shared/catalog";
import { targetFor, motionBusy } from "../../shared/interaction";
import type { PublicPlayer, Event, Motion } from "../../shared/protocol";
import { gameStore, connection, serverTime } from "../network/store";
import {
  MOTIONS,
  DIAGONAL_FISHING,
  FISHING_ACTIONS,
  DIRECTIONS,
  ROOT,
  ROD_ANCHORS,
  ROD_STATES,
  visibleMotion,
  locomotionPose,
  grip,
} from "./animations";
import {
  actionDirection,
  movementFacing,
  cardinalDirection,
  type Facing,
} from "../../shared/movement";
import { cameraMapView, type MapView } from "./minimap";
import { FALL_DIRECTIONS, fallFrame } from "../../shared/kick";
const base = import.meta.env.VITE_ASSET_BASE || "/assets";
interface Actor {
  lastMotion?: Motion;
  idleFrozen?: boolean;
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
  bubble: Phaser.GameObjects.Image;
  speech: Phaser.GameObjects.Text;
  chat?: ChatMessage;
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
  facing: Facing = "down";
  lastMapView = "";
  lastMapUpdate = 0;
  onMapView = (_view: MapView) => {};
  prediction: { x: number; y: number } | null = null;
  predictor: MovementPrediction | null = null;
  unsubscribe?: () => void;
  detach = () => {};
  readyForUpdates = false;
  route: { x: number; y: number }[] = [];
  private routeSteering = new RouteSteering();
  private keyboardSteering = new KeyboardSteering();
  ripples: Phaser.GameObjects.Sprite[] = [];
  terrainLayers: Phaser.GameObjects.Image[] = [];
  debug!: Phaser.GameObjects.Graphics;
  lastEvent: Event | null = null;
  onReady = () => {};
  kick = () => {};
  fishing = () => {};
  inventory = () => {};
  closeModal = () => {};
  profile = (id: string) => {};
  constructor() {
    super("world");
  }
  preload() {
    for (const g of ["male", "female"])
      this.load.spritesheet(`${g}_fall`, `${base}/redesign/${g}_fall.png`, {
        frameWidth: 192,
        frameHeight: 192,
      });
    for (const g of ["male", "female"])
      this.load.spritesheet(
        `${g}_fishing_diagonal`,
        `${base}/redesign/${g}_fishing_diagonal.png`,
        { frameWidth: 192, frameHeight: 192 },
      );
    for (const facing of ["down-left", "down-right", "up-left", "up-right"])
      this.load.image(
        `chair_${facing}`,
        `${base}/redesign/chair_${facing}.png`,
      );
    this.load.image("chat-bubble", `${base}/redesign/areas-chat.png`);
    this.load.image("fishing-ground", `${base}/redesign/fishing-ground.webp`);
    loadContinuousTerrain(this, base);
    for (const g of ["male", "female"])
      this.load.spritesheet(
        `${g}_diagonal`,
        `${base}/redesign/${g}_diagonal.png`,
        { frameWidth: 192, frameHeight: 192 },
      );
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
    this.readyForUpdates = true;
    for (const g of ["male", "female"])
      for (const [row, d] of ["down_right", "up_right"].entries())
        for (const [motion, spec] of Object.entries(DIAGONAL_FISHING))
          this.anims.create({
            key: `${g}_${d}_${motion}`,
            frames: this.anims.generateFrameNumbers(`${g}_fishing_diagonal`, {
              start: row * 20 + spec.start,
              end: row * 20 + spec.start + spec.count - 1,
            }),
            frameRate: spec.fps,
            repeat: spec.loop ? -1 : 0,
          });

    for (const g of ["male", "female"])
      for (const [row, diagonal] of ["down_right", "up_right"].entries())
        this.anims.create({
          key: `${g}_${diagonal}_walk`,
          frames: this.anims.generateFrameNumbers(`${g}_diagonal`, {
            start: row * 6,
            end: row * 6 + 5,
          }),
          frameRate: MOTIONS.walk.fps,
          repeat: -1,
        });
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
      Math.max(0.6, Math.min(0.9, (this.scale.height / 1024) * 0.8)),
    );
    this.add
      .image(0, 0, "fishing-ground")
      .setOrigin(0)
      .setDisplaySize(MAP.width, MAP.height)
      .setDepth(-1000);
    this.terrainLayers = drawContinuousTerrain(this);
    const npc = this.add
      .image(MAP.shop.x - 50, MAP.shop.y - 20, "npc")
      .setDisplaySize(230, 230)
      .setOrigin(0.5, 0.88)
      .setDepth(MAP.shop.y - 20);
    this.tweens.add({
      targets: npc,
      y: npc.y - 2,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
    this.add
      .text(MAP.shop.x - 50, MAP.shop.y - 235, "상점", {
        fontFamily: "NotoFishing, sans-serif",
        fontSize: "20px",
        color: "#ffffff",
        backgroundColor: "#1b3558",
        padding: { x: 15, y: 8 },
      })
      .setOrigin(0.5)
      .setDepth(MAP.shop.y + 200);
    this.anims.create({
      key: "ripples",
      frames: this.anims.generateFrameNumbers("fx", { start: 0, end: 3 }),
      frameRate: 5,
      repeat: -1,
    });
    for (const [i, spot] of SPOTS.entries()) {
      if (i % 4) continue;
      this.ripples.push(
        this.add
          .sprite(spot.water.x, spot.water.y, "fx", 0)
          .setDisplaySize(95, 60)
          .setDepth(-950)
          .setAlpha(0.18)
          .play({ key: "ripples", delay: i * 80 }),
      );
    }
    this.debug = this.add.graphics().setDepth(10000);
    if (new URLSearchParams(location.search).has("debug")) {
      for (const trail of TRAILS) {
        this.debug.lineStyle(2, 0x85bafa, 0.8);
        for (let i = 1; i < trail.points.length; i++)
          this.debug.lineBetween(
            trail.points[i - 1].x,
            trail.points[i - 1].y,
            trail.points[i].x,
            trail.points[i].y,
          );
      }
      for (const spot of SPOTS) {
        this.debug.lineStyle(1, 0xffffff, 0.6);
        this.debug.strokeCircle(spot.x, spot.y, 8);
        this.debug.lineBetween(spot.x, spot.y, spot.water.x, spot.water.y);
      }
    }
    const pointerdown = (
      pointer: Phaser.Input.Pointer,
      objects: Phaser.GameObjects.GameObject[],
    ) => {
      if (this.blocked || objects.length || !this.prediction) return;
      const goal = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.routeSteering.reset();
      this.route = walkingRoute(this.prediction, goal);
    };
    this.input.on("pointerdown", pointerdown);
    const keydown = (e: KeyboardEvent) => {
      if (
        this.blocked ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName)
      )
        return;
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(
          e.key,
        ) ||
        ["KeyC", "KeyF", "KeyI"].includes(e.code)
      )
        e.preventDefault();
      if (e.key.startsWith("Arrow")) {
        this.keyboardSteering.reset();
        this.route = [];
        this.keys.add(e.key);
      }
      if (e.repeat) return;
      if (e.code === "Space") this.kick();
      if (e.code === "KeyF") {
        this.flushMovement();
        this.fishing();
      }
      if (e.code === "KeyI") this.inventory();
      if (e.code === "KeyC") connection.command({ type: "sit" });
      if (e.key === "Escape") connection.command({ type: "cancel" });
    };
    const keyup = (e: KeyboardEvent) => {
      const before = this.keyboardSteering.input(this.keys, performance.now());
      this.keys.delete(e.key);
      this.keyboardSteering.released(
        !!before.dx && !!before.dy,
        performance.now(),
      );
    };
    const release = () => {
      this.keys.clear();
      this.keyboardSteering.reset();
      this.route = [];
      this.predictor?.flush((x, y, ms) =>
        connection.move(x, y, this.direction, ms),
      );
      connection.move(0, 0, this.direction, 0);
      this.lastInput = "";
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    this.unsubscribe = gameStore.subscribe(() => this.receive());
    this.receive();
    this.onReady();
    this.detach = () => {
      this.readyForUpdates = false;
      this.onMapView = () => {};
      this.unsubscribe?.();
      this.unsubscribe = undefined;
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
      this.input?.off("pointerdown", pointerdown);
    };
    this.events.once("shutdown", this.detach);
    this.events.once("destroy", this.detach);
  }
  flushMovement() {
    this.predictor?.flush((x, y, ms) =>
      connection.move(x, y, this.direction, ms),
    );
    connection.move(0, 0, this.direction, 0);
  }
  receive() {
    // Scene destruction and React hot replacement must never leave a live store callback.
    if (!this.readyForUpdates || !this.sys?.displayList) return;
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
    const latestChat = new Map(s.chat.map((m) => [m.playerId, m]));
    for (const p of s.players) {
      let a = this.actors.get(p.id);
      if (!a) {
        a = {
          body: this.add
            .sprite(p.x, p.y, `${p.gender}_${p.direction}`, 0)
            .setOrigin(ROOT.x, ROOT.y)
            .setDisplaySize(256, 256)
            .setInteractive({ useHandCursor: true }),
          shadow: this.add.image(p.x, p.y, "shadow").setDisplaySize(115, 44),
          chair: this.add
            .image(p.x, p.y, "chair_down")
            .setDisplaySize(185, 185)
            .setOrigin(0.5, 0.8),
          rod: this.add
            .image(p.x, p.y, "rod_1")
            .setOrigin(0.18, 0.84)
            .setDisplaySize(134, 134),
          line: this.add.image(0, 0, "line").setOrigin(0.5, 0),
          bobber: this.add.image(0, 0, "bobber").setDisplaySize(38, 38),
          name: this.add
            .text(p.x, p.y, p.name, {
              fontFamily: "NotoFishing, sans-serif",
              fontSize: "24px",
              fontStyle: "bold",
              color: "#ffffff",
              stroke: "#17375b",
              strokeThickness: 5,
            })
            .setOrigin(0.5),
          target: this.add.image(p.x, p.y, "target").setDisplaySize(34, 34),
          bubble: this.add
            .image(p.x, p.y, "chat-bubble")
            .setOrigin(0.5, 1)
            .setVisible(false),
          speech: this.add
            .text(p.x, p.y, "", {
              fontFamily: "NotoFishing, sans-serif",
              fontSize: "24px",
              color: "#244f79",
              align: "center",
              wordWrap: { width: 280, useAdvancedWrap: true },
            })
            .setOrigin(0.5)
            .setVisible(false),
          state: p,
          samples: [],
          shownEvent: 0,
        };
        a.body.on("pointerdown", () => {
          if (!this.blocked) this.profile(p.id);
        });
        this.actors.set(p.id, a);
      }
      const message = latestChat.get(p.id);
      if (message && message.id !== a.chat?.id) {
        a.chat = message;
        a.speech.setText(message.text);
      }
      if (
        p.id === s.self?.id &&
        p.motion === "fallen" &&
        (a.state.motion !== "fallen" || a.state.stateAt !== p.stateAt)
      )
        this.route = [];
      const changedSeq = a.state.seq !== p.seq;
      const changedPosition = a.state.x !== p.x || a.state.y !== p.y;
      a.state = p;
      if (changedSeq || changedPosition || !a.samples.length) {
        a.samples.push({ t: now, x: p.x, y: p.y });
        if (a.samples.length > 12) a.samples.shift();
      }
      if (p.id === s.self?.id) {
        if (!this.prediction) {
          this.direction = p.direction;
          this.facing = p.facing ?? p.direction;
        }
        if (!this.predictor) this.predictor = new MovementPrediction(p);
        if (
          s.status !== "online" ||
          p.castStartedAt !== undefined ||
          motionBusy(p, serverTime())
        ) {
          this.predictor.reset(p);
          this.prediction = this.predictor.position;
        } else if (changedSeq || changedPosition || !this.prediction) {
          this.prediction = this.predictor.reconcile(p, p.seq);
        }
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
        .image(a.state.x, a.state.y - 250, e.fishId)
        .setDepth(8000);
      img.setScale(150 / Math.max(img.width, img.height));
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
          .image(a.state.x - 28 + i * 15, a.state.y - 180, "star")
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
          kickDirection: actionDirection(a.state.facing ?? a.state.direction),
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
      ({ dx, dy } = this.keyboardSteering.input(this.keys, performance.now()));
      if (!this.keys.size && this.route.length && this.prediction) {
        while (
          this.route.length &&
          Math.hypot(
            this.route[0].x - this.prediction.x,
            this.route[0].y - this.prediction.y,
          ) < 16
        )
          this.route.shift();
        const next = this.route[0];
        if (next) {
          ({ dx, dy } = this.routeSteering.toward(this.prediction, next));
        }
      }
    }
    if (this.blocked) this.route = [];
    const busy = me && motionBusy(me.state, now);
    if (busy) {
      dx = 0;
      dy = 0;
    }
    this.direction = cardinalDirection(dx, dy, this.direction);
    if (me && this.predictor && s.status === "online") {
      const previous = this.predictor.position;
      this.prediction = this.predictor.advance(dx, dy, delta, (x, y, ms) =>
        connection.move(x, y, this.direction, ms),
      );
      const moved =
        Math.hypot(
          this.prediction.x - previous.x,
          this.prediction.y - previous.y,
        ) > 0.001;
      this.facing = movementFacing(
        moved ? this.prediction.x - previous.x : dx,
        moved ? this.prediction.y - previous.y : dy,
        this.facing,
      );
    }
    const kickTarget = me ? targetFor(me.state, s.players, now) : undefined;
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
      let direction =
        motion === "kick"
          ? actionDirection(a.state.facing ?? a.state.direction)
          : a.state.direction;
      if (a.escape && now - a.escape.at < 450)
        direction = a.escape.kickDirection;
      if (self && !busy && (motion === "idle" || motion === "walk")) {
        motion = dx || dy ? "walk" : "idle";
        direction = this.direction;
      }
      a.body.setPosition(x, y).setDepth(y + 1);
      const fall =
        motion === "startled"
          ? Math.sin(
              Phaser.Math.Clamp((now - a.state.stateAt) / 650, 0, 1) * Math.PI,
            )
          : 0;
      a.body
        .setY(y - fall * 38)
        .setAngle(fall * (direction === "left" ? -18 : 18));
      const pose = locomotionPose(
        direction,
        motion,
        self && (motion === "walk" || motion === "idle")
          ? this.facing
          : (a.state.facing ?? direction),
      );
      const anim = `${a.state.gender}_${pose.animationDirection}_${motion}`;
      if (motion === "fallen") {
        // Server age selects the same pose in every browser, including mid-fall joins.
        const facing = a.state.facing ?? direction;
        const row = FALL_DIRECTIONS.indexOf(facing);
        a.body.anims.stop();
        a.body
          .setFlipX(false)
          .setTexture(
            `${a.state.gender}_fall`,
            Math.max(0, row) * 6 + fallFrame(now - a.state.stateAt),
          );
      } else if (
        motion === "idle" &&
        (a.lastMotion === "walk" || a.idleFrozen) &&
        a.body.anims.currentAnim?.key ===
          `${a.state.gender}_${pose.animationDirection}_walk`
      ) {
        a.body.setFlipX(pose.flipX).anims.pause();
        a.idleFrozen = true;
      } else {
        a.idleFrozen = false;
        a.body.setFlipX(pose.flipX);
        if (a.body.anims.currentAnim?.key === anim && a.body.anims.isPaused)
          a.body.anims.resume();
        else a.body.play(anim, true);
      }
      a.lastMotion = motion;
      a.shadow.setPosition(x, y).setDepth(y - 3);
      a.name.setPosition(x, y - 240).setDepth(y + 200);
      const chatAge = a.chat ? now - a.chat.at : CHAT_LIFETIME;
      const speaking = chatAge >= 0 && chatAge < CHAT_LIFETIME;
      const alpha = Math.min(1, Math.max(0, (CHAT_LIFETIME - chatAge) / 700));
      const bw = Math.max(170, a.speech.width + 54),
        bh = Math.max(90, a.speech.height + 52);
      a.bubble
        .setVisible(speaking)
        .setPosition(x, y - 280)
        .setDisplaySize(bw, bh)
        .setDepth(y + 500)
        .setAlpha(alpha);
      a.speech
        .setVisible(speaking)
        .setPosition(x, y - 280 - bh * 0.55)
        .setDepth(y + 501)
        .setAlpha(alpha);
      a.name.setAlpha(a.state.online ? 1 : 0.6);
      const seated = FISHING_ACTIONS.includes(motion);
      const fishingFacing = a.state.facing ?? direction;
      const chairDirection = seated ? fishingFacing : direction;
      a.chair
        .setVisible(seated)
        .setTexture(`chair_${chairDirection}`)
        .setPosition(
          x + (direction === "left" ? 18 : direction === "right" ? -18 : 0),
          y + 10,
        )
        .setDepth(chairDirection.startsWith("up") ? y + 3 : y - 1);
      a.chair.setAngle(fall * -32).setAlpha(1 - fall * 0.7);
      a.target
        .setVisible(kickTarget?.id === id)
        .setPosition(x, y - 270)
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
        const rodDirection = actionDirection(fishingFacing);
        const anchor = grip(
          fishingFacing,
          motion,
          Math.max(
            0,
            Number(a.body.frame.name) -
              (motion === "fallen" ? 0 : MOTIONS[motion].start),
          ),
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
        const pose = ROD_ANCHORS[rodDirection];
        a.rod
          .setTexture(`rod_${a.state.rod}_${rodDirection}_${rodState}`)
          .setOrigin(pose.grip.x, pose.grip.y)
          .setDisplaySize(134, 134)
          .setPosition(x + anchor.x * 1.88, y + anchor.y * 1.88 - 16)
          .setDepth(direction === "up" ? y : y + 3);
        const diagonalAngle =
          fishingFacing === "down-right" || fishingFacing === "up-left"
            ? -45
            : fishingFacing === "down-left" || fishingFacing === "up-right"
              ? 45
              : 0;
        a.rod.setAngle(
          diagonalAngle +
            (motion === "startled"
              ? Math.sin((now - a.state.stateAt) / 70) * 40
              : 0),
        );
        if (motion === "startled")
          a.rod.setY(
            a.rod.y -
              Math.sin(Math.min(1, (now - a.state.stateAt) / 650) * Math.PI) *
                38,
          );
        const end = a.state.castWater ?? fishingSpot(a.state)?.water;
        if (end) {
          const rotation = a.rod.rotation;
          const tx = 134 * (pose.tip.x - pose.grip.x),
            ty = 134 * (pose.tip.y - pose.grip.y);
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
      if (performance.now() - this.lastMapUpdate > 100) {
        const camera = this.cameras.main;
        const view = cameraMapView(camera, p);
        const key = Object.values(view)
          .map((v) => Math.round(v * 10))
          .join(",");
        if (key !== this.lastMapView) {
          this.onMapView(view);
          this.lastMapView = key;
        }
        this.lastMapUpdate = performance.now();
      }
    }
    // Keep the coherent source painting visible around independently generated tile joins.
  }
}
