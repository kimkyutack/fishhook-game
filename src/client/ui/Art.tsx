import { FISH } from "../../shared/catalog";
export const asset = (type: string, id: string) =>
  `${import.meta.env.VITE_ASSET_BASE || "/assets"}/${(type === "characters" && id.endsWith("_portrait")) || (type === "equipment" && ["bag", "close", "rod_1", "rod_2", "rod_3", "worm", "mix", "live", "special"].includes(id)) ? "redesign" : type}/${id}.png`;
export function Icon({ id, size = 28 }: { id: string; size?: number }) {
  return (
    <img
      className="icon"
      src={
        ["coin", "close"].includes(id)
          ? asset(
              "redesign",
              id === "coin" ? "pocket-icon-coin" : `quick-${id}`,
            )
          : asset(
              id === "book" || id.startsWith("crown_")
                ? "redesign"
                : "equipment",
              id,
            )
      }
      width={size}
      height={size}
      alt=""
    />
  );
}
export function Stars({ star }: { star: number }) {
  return (
    <span className="stars" aria-label={`${star}성`}>
      {Array.from({ length: star }, (_, i) => (
        <Icon key={i} id="star" size={16} />
      ))}
    </span>
  );
}
export function FishImage({
  id,
  hidden = false,
}: {
  id: string;
  hidden?: boolean;
}) {
  const f = FISH.find((f) => f.id === id);
  return (
    <img
      className={`fish-image ${hidden ? "silhouette" : ""}`}
      src={asset("fish", id)}
      alt={hidden ? "미획득 물고기" : f?.name}
    />
  );
}
