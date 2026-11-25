export const BALANCE = {
  world: "world-v1",
  maxPlayers: 50,
  speed: 220,
  interaction: 96,
  shoreDistance: 64,
  sessionMs: 30 * 24 * 3600_000,
  rechargeMs: 3600_000,
  protectionMs: 60_000,
  sell: [0, 20, 60, 160, 550, 2500],
  duration: [
    [0, 0],
    [6000, 10000],
    [10000, 16000],
    [18000, 28000],
    [35000, 55000],
    [75000, 110000],
  ],
  starterCoins: 100,
  starterBait: 20,
  maxCharges: 3,
  shareCooldown: 10_000,
} as const;
export const RODS = [
  { id: 1, name: "기본 낚싯대", price: 0, maxStar: 3 },
  { id: 2, name: "숙련 낚싯대", price: 2500, maxStar: 4 },
  { id: 3, name: "명인 낚싯대", price: 15000, maxStar: 5 },
] as const;
export const BAITS = [
  {
    id: "worm",
    name: "지렁이",
    price: 3,
    requires: 1,
    weights: [60, 27, 10, 2.8, 0.2],
  },
  {
    id: "mix",
    name: "배합 미끼",
    price: 15,
    requires: 1,
    weights: [25, 40, 26, 8.2, 0.8],
  },
  {
    id: "live",
    name: "생미끼",
    price: 50,
    requires: 2,
    weights: [10, 25, 40, 23, 2],
  },
  {
    id: "special",
    name: "특별 미끼",
    price: 120,
    requires: 3,
    weights: [5, 15, 30, 44, 6],
  },
] as const;
export type BaitId = (typeof BAITS)[number]["id"];
