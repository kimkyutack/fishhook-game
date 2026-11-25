import { BAITS, BALANCE, RODS, type BaitId } from "../config/balance";
import { FISH, type Habitat } from "./catalog";
export function normalizeName(input: string) {
  const name = input.normalize("NFKC").trim();
  if (!/^[가-힣a-zA-Z0-9_]{2,12}$/.test(name))
    throw Error("이름은 한글·영문·숫자·밑줄 2~12자입니다.");
  return { name, key: name.toLowerCase() };
}
export function probabilities(rod: number, bait: BaitId, habitat: Habitat) {
  const b = BAITS.find((v) => v.id === bait)!;
  const max = RODS[rod - 1].maxStar;
  const weights = b.weights.map((w, i) =>
    i < max && FISH.some((f) => f.star === i + 1 && f.habitat === habitat)
      ? w
      : 0,
  );
  const total = weights.reduce<number>((a, b) => a + b, 0);
  return weights.map((w) => w / total);
}
export function drawFish(
  rod: number,
  bait: BaitId,
  habitat: Habitat,
  random = secureRandom,
) {
  let r = random();
  const p = probabilities(rod, bait, habitat);
  let star = 1;
  for (let i = 0; i < p.length; i++) {
    r -= p[i];
    if (r < 0) {
      star = i + 1;
      break;
    }
  }
  const candidates = FISH.filter(
    (f) => f.star === star && f.habitat === habitat,
  );
  const fish =
    candidates[
      Math.min(candidates.length - 1, Math.floor(random() * candidates.length))
    ];
  const [min, max] = BALANCE.duration[star];
  return { fish, duration: Math.floor(min + random() * (max - min + 1)) };
}
export function secureRandom() {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
}
export function recharge(
  charges: number,
  next: number | null,
  now: number,
): { charges: number; next: number | null } {
  if (charges >= 3) return { charges: 3, next: null };
  if (next === null) return { charges, next: now + BALANCE.rechargeMs };
  if (now < next) return { charges, next };
  const gained = 1 + Math.floor((now - next) / BALANCE.rechargeMs);
  const value = Math.min(3, charges + gained);
  return {
    charges: value,
    next: value === 3 ? null : next + gained * BALANCE.rechargeMs,
  };
}
