import { saveSettings, setGame, useGame, type Settings } from "../game/store";
import { toTitle } from "../game/flow/story";
import { audio } from "../audio/audio";
import { tts } from "../audio/tts";
import { Icon } from "./icons";
import { Ja } from "./Talk";

function apply(next: Settings) {
  saveSettings(next);
  setGame({ settings: next });
  audio.setVolumes(next.music, next.sfx);
  tts.setRate(next.slowVoice ? 0.8 : 1);
}

function Toggle({ label, ja, on, onChange, id }: { label: string; ja: string; on: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <label className="setting">
      <span>
        {label} <Ja>{ja}</Ja>
      </span>
      <button className={`switch ${on ? "on" : ""}`} role="switch" aria-checked={on} onClick={() => onChange(!on)} data-testid={`toggle-${id}`}>
        <i />
      </button>
    </label>
  );
}

function Slider({ label, ja, value, onChange, id }: { label: string; ja: string; value: number; onChange: (v: number) => void; id: string }) {
  return (
    <label className="setting">
      <span>
        {label} <Ja>{ja}</Ja>
      </span>
      <input type="range" min={0} max={1} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} data-testid={`slider-${id}`} />
    </label>
  );
}

export function SettingsModal() {
  const open = useGame((s) => s.settingsOpen);
  const s = useGame((st) => st.settings);
  const screen = useGame((st) => st.screen);
  const micState = useGame((st) => st.micState);
  if (!open) return null;
  const set = (patch: Partial<Settings>) => apply({ ...s, ...patch });
  return (
    <div className="modal-back ui" onClick={() => setGame({ settingsOpen: false })}>
      <div className="settings modal panel" onClick={(e) => e.stopPropagation()} data-testid="settings" role="dialog" aria-label="Settings">
        <header>
          <Icon id="gear" size={28} />
          <h1>
            Settings <Ja>せってい</Ja>
          </h1>
          <button className="round close-btn" onClick={() => setGame({ settingsOpen: false })} aria-label="Close" data-testid="settings-close">
            <Icon id="close" size={22} />
          </button>
        </header>
        <div className="setting mode-row">
          <span>
            Answers <Ja>こたえかた</Ja>
          </span>
          <div className="mode-switch small" role="group" aria-label="Answer mode">
            <button className={s.mic ? "on" : ""} aria-pressed={s.mic} onClick={() => set({ mic: true })} data-testid="settings-speak">
              <Icon id="mic" size={22} /> Speak
            </button>
            <button className={!s.mic ? "on" : ""} aria-pressed={!s.mic} onClick={() => set({ mic: false })} data-testid="settings-tap">
              <Icon id="check" size={20} /> Tap
            </button>
          </div>
        </div>
        {s.mic && micState === "blocked" && <p className="note">The microphone is blocked on this device: answers are tapped.</p>}
        <Toggle label="Japanese help" ja="にほんごの ヒント" on={s.japanese} onChange={(japanese) => set({ japanese })} id="japanese" />
        <Toggle label="Slow voice" ja="ゆっくり よむ" on={s.slowVoice} onChange={(slowVoice) => set({ slowVoice })} id="slow" />
        <Slider label="Music" ja="おんがく" value={s.music} onChange={(music) => set({ music })} id="music" />
        <Slider label="Sounds" ja="こうかおん" value={s.sfx} onChange={(sfx) => set({ sfx })} id="sfx" />
        {screen !== "title" && (
          <button
            className="secondary"
            onClick={() => {
              setGame({ settingsOpen: false });
              toTitle();
            }}
            data-testid="settings-title"
          >
            Save and go to the title <Ja>セーブして タイトルへ</Ja>
          </button>
        )}
      </div>
    </div>
  );
}
