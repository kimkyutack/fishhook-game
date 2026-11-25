import { writeFile } from "node:fs/promises";
import { BAITS, BALANCE, type BaitId } from "../src/config/balance";
import { probabilities, drawFish } from "../src/shared/rules";
const lines = [
  "# 초기 경제 계산과 성장 시뮬레이션",
  "",
  "이동·방해·상점 체류를 제외하고 포획 즉시 판매하는 모델입니다. 실제 사람의 플레이테스트 결과가 아닙니다.",
  "",
  "|낚싯대|미끼|평균 대기 초|회당 순수익|분당 순수익|",
  "|---|---|---:|---:|---:|",
];
for (const rod of [1, 2, 3])
  for (const bait of BAITS.filter((b) => b.requires <= rod)) {
    const p = probabilities(rod, bait.id, "pond");
    const wait = p.reduce(
        (a, v, i) =>
          a +
          (v * (BALANCE.duration[i + 1][0] + BALANCE.duration[i + 1][1])) /
            2000,
        0,
      ),
      profit =
        p.reduce((a, v, i) => a + v * BALANCE.sell[i + 1], 0) - bait.price;
    lines.push(
      `|${rod}|${bait.name}|${wait.toFixed(2)}|${profit.toFixed(2)}|${((60 * profit) / wait).toFixed(2)}|`,
    );
  }
let seed = 20261125;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const results = [];
const runs = 2000;
for (const [first, second] of [
  ["worm", "worm"],
  ["worm", "mix"],
  ["mix", "live"],
] as [BaitId, BaitId][]) {
  const stage2: number[] = [],
    stage3: number[] = [];
  for (let i = 0; i < runs; i++) {
    let coins = 100,
      worms = 20,
      rod = 1,
      time = 0,
      casts = 0;
    while (rod < 3 && casts++ < 10000) {
      let bait = rod === 1 ? first : second;
      if (bait === "worm" && worms > 0) worms--;
      else {
        let price: number = BAITS.find((b) => b.id === bait)!.price;
        if (coins < price) {
          bait = "worm";
          price = 3;
          if (worms > 0) {
            worms--;
            price = 0;
          } else if (coins < 3) {
            worms = 2;
            price = 0;
          }
        }
        coins -= price;
      }
      const draw = drawFish(rod, bait, "pond", random);
      time += draw.duration;
      coins += draw.fish.sellPrice;
      const cost = rod === 1 ? 2500 : 15000;
      if (coins >= cost) {
        coins -= cost;
        rod++;
        if (rod === 2) stage2.push(time / 60000);
        else stage3.push(time / 60000);
      }
    }
    if (rod !== 3) throw Error("Growth simulation did not converge");
  }
  const summarize = (a: number[]) => {
    a.sort((x, y) => x - y);
    return {
      mean: a.reduce((x, y) => x + y, 0) / a.length,
      p10: a[Math.floor(a.length * 0.1)],
      p50: a[Math.floor(a.length * 0.5)],
      p90: a[Math.floor(a.length * 0.9)],
    };
  };
  results.push({
    strategy: `${first} → ${second}`,
    stage2: summarize(stage2),
    stage3: summarize(stage3),
  });
}
lines.push(
  "",
  "## 2,000회씩 실행한 성장 결과",
  "",
  "고정 난수 시드 20261125. 시작 코인 100, 지렁이 20개, 미끼 1개씩 구매, 단계별 추가 비용을 반영했습니다. 표의 3단계 시간은 게임 시작부터의 누적 시간입니다.",
  "",
  "|1단계 → 2단계 미끼 전략|2단계 평균 분|3단계 평균 분|3단계 10~90백분위 분|",
  "|---|---:|---:|---:|",
);
for (const r of results)
  lines.push(
    `|${r.strategy}|${r.stage2.mean.toFixed(1)}|${r.stage3.mean.toFixed(1)}|${r.stage3.p10.toFixed(1)}~${r.stage3.p90.toFixed(1)}|`,
  );
lines.push(
  "",
  "가격·가중치·시간은 src/config/balance.ts에서 조절합니다. 초기 목표인 2단계 10~20분, 누적 3단계 45~90분과 비교하되, 이동·판매·방해로 실제 플레이 시간은 늘어납니다. 사람의 검증 없이 수치를 임의 조정하지 않았습니다.",
);
await writeFile("docs/economy.md", lines.join("\n"));
await writeFile(
  "docs/economy-simulation.json",
  JSON.stringify(
    { seed: 20261125, runsPerStrategy: runs, habitat: "pond", results },
    null,
    2,
  ),
);
console.log(lines.join("\n"));
