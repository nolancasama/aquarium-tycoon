import { useEffect, useRef } from "react";
import { GameScene } from "./scene/GameScene";
import { bottomPanel } from "./scene/CameraRig";
import { Hud } from "./ui/Hud";
import { DialoguePanel, FishTalk, PromptPanel, RequestBanner } from "./ui/Talk";
import { DecorChoiceStrip, DecorShop, DecorTray, FishShop, TankShop } from "./ui/Shop";
import { SettingsModal } from "./ui/Settings";
import { ResultsScreen, StageCardModal, TitleScreen } from "./ui/Screens";
import { installKeyboard } from "./input/keyboard";
import { onKey } from "./game/flow/input";
import { hasSaved, installAutosave, saveIsLost } from "./game/flow/story";
import { getGame, setGame, useGame } from "./game/store";
import { rt } from "./game/runtime";
import { tts } from "./audio/tts";
import { audio } from "./audio/audio";

/** Management view: drag sideways to turn the room a little; wheel or pinch to zoom. */
function useCameraGestures(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const roomView = () => {
      const g = getGame();
      return g.screen === "game" && g.view === "room" && !rt.camera.shot && g.mode !== "busy";
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === "touch") setGame({ touch: true });
      const target = e.target as HTMLElement;
      if (target.closest(".ui, button, input, .modal")) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!roomView()) return;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) rt.camera.zoom = Math.min(1.25, Math.max(0.8, rt.camera.zoom * (d / pinch)));
        pinch = d;
        return;
      }
      rt.camera.orbit = Math.min(0.52, Math.max(-0.52, rt.camera.orbit - dx * 0.004));
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
    };
    const wheel = (e: WheelEvent) => {
      if (!roomView()) return;
      rt.camera.zoom = Math.min(1.25, Math.max(0.8, rt.camera.zoom * (e.deltaY > 0 ? 0.94 : 1.06)));
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [ref]);
}

/** Keep the camera's lens shift in step with the bottom panel's height. */
function BottomPanels() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      bottomPanel.height = el.offsetHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="bottom-panels" ref={ref}>
      <FishShop />
      <DecorChoiceStrip />
      <PromptPanel />
      <DialoguePanel />
    </div>
  );
}

function Fade() {
  const fade = useGame((s) => s.fade);
  return <div className="fade" style={{ opacity: fade }} />;
}

export function App() {
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => installKeyboard(onKey), []);
  useEffect(() => tts.onSpeakingChange((on) => audio.setSpeaking(on)), []);
  useEffect(() => installAutosave(), []);
  useEffect(() => {
    if (window.matchMedia?.("(pointer: coarse)").matches) setGame({ touch: true });
    setGame({ hasSave: hasSaved(), saveLost: saveIsLost() });
  }, []);
  useCameraGestures(wrap);
  const touch = useGame((s) => s.touch);
  const view = useGame((s) => s.view);
  const panel = useGame((s) => s.panel);
  return (
    <div className={`app ${touch ? "touch" : ""} view-${view} ${panel ? `panel-${panel}` : ""}`} ref={wrap}>
      <GameScene />
      <Hud />
      <div className="top-panels">
        <RequestBanner />
        <FishTalk />
      </div>
      <DecorTray />
      <DecorShop />
      <TankShop />
      <BottomPanels />
      <TitleScreen />
      <StageCardModal />
      <ResultsScreen />
      <SettingsModal />
      <Fade />
    </div>
  );
}
