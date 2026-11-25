import { z } from "zod";
import type { Direction } from "../config/map";
import type { BaitId } from "../config/balance";
const commandId = z.string().uuid();
export const CommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cast"), commandId }),
  z.object({ type: z.literal("cancel"), commandId }),
  z.object({ type: z.literal("sit"), commandId }),
  z.object({
    type: z.literal("sabotage"),
    commandId,
    target: z.string().uuid(),
  }),
  z.object({
    type: z.literal("buyRod"),
    commandId,
    rod: z.number().int().min(2).max(3),
  }),
  z.object({
    type: z.literal("buyBait"),
    commandId,
    bait: z.enum(["worm", "mix", "live", "special"]),
    quantity: z.number().int().min(1).max(1000),
  }),
  z.object({
    type: z.literal("equip"),
    commandId,
    rod: z.number().int().min(1).max(3).optional(),
    bait: z.enum(["worm", "mix", "live", "special"]).optional(),
  }),
  z.object({
    type: z.literal("sell"),
    commandId,
    ids: z.array(z.string().uuid()).max(150),
  }),
  z.object({ type: z.literal("sellAll"), commandId }),
  z.object({
    type: z.literal("lock"),
    commandId,
    id: z.string().uuid(),
    locked: z.boolean(),
  }),
  z.object({
    type: z.literal("share"),
    commandId,
    catchId: z.number().int().positive(),
  }),
  z.object({ type: z.literal("refill"), commandId }),
]);
export const MoveSchema = z.object({
  type: z.literal("move"),
  seq: z.number().int().nonnegative(),
  dx: z.number().min(-1).max(1),
  dy: z.number().min(-1).max(1),
  direction: z.enum(["up", "down", "left", "right"]),
});
export type Command = z.infer<typeof CommandSchema>;
export type Motion =
  | "idle"
  | "walk"
  | "sit_down"
  | "seated_idle"
  | "cast"
  | "fishing_wait"
  | "reel_in"
  | "kick"
  | "run"
  | "startled";
export interface PublicPlayer {
  id: string;
  name: string;
  gender: "male" | "female";
  x: number;
  y: number;
  direction: Direction;
  motion: Motion;
  stateAt: number;
  castStartedAt?: number;
  protectedUntil: number;
  rod: number;
  online: boolean;
  seq: number;
  best?: { fishId: string; star: number };
}
export interface PrivatePlayer {
  id: string;
  name: string;
  gender: "male" | "female";
  coins: number;
  rod: number;
  bait: BaitId;
  rods: number[];
  baits: Record<BaitId, number>;
  charges: number;
  nextRechargeAt: number | null;
  inventory: { id: string; fishId: string; catchId: number; locked: number }[];
  bestiary: { fishId: string; count: number; catchId: number }[];
  rank: number | null;
  inventoryTotals: {
    count: number;
    unlockedCount: number;
    unlockedValue: number;
  };
}
export interface Rank {
  id: string;
  name: string;
  fishId: string;
  star: number;
  caughtAt: number;
  sequence: number;
}
export interface Feed {
  id: number;
  playerId: string;
  name: string;
  fishId: string;
  at: number;
}
export interface Snapshot {
  type: "snapshot";
  serverNow: number;
  self: PrivatePlayer;
  players: PublicPlayer[];
  ranking: Rank[];
  feed: Feed[];
}
export type Event =
  | {
      type: "caught";
      playerId: string;
      fishId: string;
      catchId: number;
      at: number;
    }
  | {
      type: "sabotaged";
      attacker: string;
      target: string;
      at: number;
      from: { x: number; y: number };
      to: { x: number; y: number };
    };
