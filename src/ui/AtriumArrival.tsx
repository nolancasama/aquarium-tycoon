import { useEffect } from "react";
import { getGame, setGame, updateModel, useGame } from "../game/store";
import { rt } from "../game/runtime";

/** A brief, optional arrival moment; no tutorial task or assessed language. */
export function AtriumArrival() {
  const visible = useGame((s) => s.atriumArrival);
  useEffect(() => {
    let timer: number | undefined;
    const finish = () => {
      if (!rt.atriumReveal) return;
      rt.atriumReveal = null;
      rt.camera.shot = null;
      updateModel((m) => ({ ...m, progress: { ...m.progress, atriumIntroSeen: true } }));
      setGame({ atriumArrival: false, mode: "play" });
      window.clearTimeout(timer);
    };
    const check = () => {
      const g = getGame();
      if (rt.atriumReveal) {
        if (g.screen !== "game" || g.hall !== 3) {
          rt.atriumReveal = null;
          rt.camera.shot = null;
          window.clearTimeout(timer);
          setGame({ atriumArrival: false, ...(g.screen === "game" && g.mode === "busy" ? { mode: "play" as const } : {}) });
        }
        return;
      }
      if (g.screen !== "game" || g.hall !== 3 || g.view !== "room" || !g.model.progress.atriumOpen || g.model.progress.atriumIntroSeen || g.mode !== "play" || g.panel || g.placing || g.prompt || g.line || g.request || g.settingsOpen) return;
      rt.atriumReveal = { t0: rt.time, reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false };
      rt.camera.shot = { pos: { x: 34.5, y: 4.2, z: 9.2 }, target: { x: 38, y: 1.65, z: -1 } };
      setGame({ atriumArrival: true, mode: "busy", nudge: null });
      timer = window.setTimeout(finish, 3600);
    };
    const key = (e: KeyboardEvent) => {
      if (rt.atriumReveal && ["Escape", "Space", "Enter"].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); finish(); }
    };
    const unsubscribe = useGame.subscribe(check);
    window.addEventListener("keydown", key, true);
    window.addEventListener("atrium-skip", finish);
    check();
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("atrium-skip", finish);
    };
  }, []);
  if (!visible) return null;
  return <div className="atrium-arrival ui" data-testid="atrium-arrival">
    <b>Coral Reef Atrium</b>
    <span lang="ja">サンゴの アトリウム</span>
    <button onClick={() => window.dispatchEvent(new Event("atrium-skip"))}>Skip <span lang="ja">スキップ</span></button>
  </div>;
}
