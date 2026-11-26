import { useEffect, useState } from "react";
import { fishById } from "../../shared/catalog";
import { FishImage, Stars } from "./Art";
import type { CatchNotice } from "../network/store";
export function CatchAnnouncement({ notices }: { notices: CatchNotice[] }) {
  const [active, setActive] = useState<CatchNotice | null>(null);
  const [seen, setSeen] = useState(0);
  useEffect(() => {
    if (active) return;
    const next = notices.find((n) => n.catchId > seen);
    if (next) setActive(next);
  }, [notices, active, seen]);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      setSeen(active.catchId);
      setActive(null);
    }, 5800);
    return () => clearTimeout(timer);
  }, [active]);
  if (!active) return null;
  const fish = fishById(active.fishId);
  return (
    <aside
      key={active.catchId}
      className="rare-catch-notice panel"
      role="status"
      aria-live="polite"
    >
      <FishImage id={fish.id} />
      <div>
        <Stars star={fish.star} />
        <p>
          <strong>{active.playerName}</strong>님이 <strong>{fish.name}</strong>
          를 낚았습니다!
        </p>
      </div>
    </aside>
  );
}
