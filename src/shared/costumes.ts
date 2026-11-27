export const COSTUME_IDS = ["default", "duck", "office", "santa"] as const;
export type CostumeId = (typeof COSTUME_IDS)[number];
export type Gender = "male" | "female";
export const COSTUME_PRICE = 3000;
export const COSTUMES = [
  { id: "default", name: "낚시 친구", price: 0 },
  { id: "duck", name: "오리 유치원생", price: COSTUME_PRICE },
  { id: "office", name: "꼬마 회사원", price: COSTUME_PRICE },
  { id: "santa", name: "꼬마 산타", price: COSTUME_PRICE },
] as const;
export const costumeKey = (gender: Gender, costume: CostumeId = "default") =>
  costume === "default" ? gender : `${gender}_${costume}`;
export const costumePortrait = (
  gender: Gender,
  costume: CostumeId = "default",
) =>
  `${costume === "default" ? "redesign" : "costumes"}/${costumeKey(gender, costume)}_portrait.png`;
