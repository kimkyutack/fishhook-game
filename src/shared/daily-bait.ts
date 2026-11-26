// 09:00 Asia/Seoul is 00:00 UTC; this boundary is independent of host timezone.
export const DAILY_BAIT_PERIOD_MS = 24 * 60 * 60 * 1000;
export const DAILY_BAIT_AMOUNT = 20;
export const dailyBaitPeriod = (now: number) =>
  Math.floor(now / DAILY_BAIT_PERIOD_MS);
