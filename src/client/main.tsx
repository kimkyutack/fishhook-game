import { createRoot } from "react-dom/client";
import { lazy, Suspense, useEffect, useSyncExternalStore } from "react";
import { connection, gameStore } from "./network/store";
import { Welcome } from "./ui/Welcome";
import "./style.css";
const Game = lazy(() => import("./ui/Game").then((m) => ({ default: m.Game })));
function App() {
  const s = useSyncExternalStore(gameStore.subscribe, gameStore.get);
  useEffect(() => {
    void connection.boot();
    return () => connection.stop();
  }, []);
  if (s.status === "loading") return <div className="boot">모여라 낚시터</div>;
  return s.self ? (
    <Suspense fallback={<div className="boot">낚시터에 들어가는 중…</div>}>
      <Game />
    </Suspense>
  ) : (
    <Welcome />
  );
}
createRoot(document.getElementById("root")!).render(<App />);
