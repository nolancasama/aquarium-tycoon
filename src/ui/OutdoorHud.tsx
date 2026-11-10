import { useGame, type OutdoorArea } from "../game/store";
import { Icon } from "./icons";
import { Ja } from "./Talk";
import { LAGOON_MILESTONES } from "../game/flow/lagoon";
import { SANCTUARY_MILESTONES } from "../game/flow/sanctuary";
import "./OutdoorHud.css";

/** Shared pieces of the two outdoor areas' HUDs: the arrival card and the milestone celebration. */

const ARRIVAL: Record<OutdoorArea, { en: string; ja: string; sub: string; subJa: string }> = {
  lagoon: { en: "Dolphin Lagoon", ja: "イルカの ラグーン", sub: "Outside! Sun, sea and dolphins.", subJa: "そとだよ！ たいようと うみと イルカ" },
  sanctuary: { en: "Grand Ocean Sanctuary", ja: "うみの サンクチュアリ", sub: "A big home in the sea for orcas.", subJa: "シャチの ための ひろい うみの すみか" }
};

export function OutdoorArrival() {
  const a = useGame((s) => s.areaArrival);
  if (!a) return null;
  const t = ARRIVAL[a];
  return (
    <div className={`outdoor-arrival ui ${a}`} data-testid="outdoor-arrival" role="status">
      <b>{t.en}</b>
      <Ja>{t.ja}</Ja>
      <small>{t.sub}<Ja>{t.subJa}</Ja></small>
    </div>
  );
}

type Milestones = readonly { en: string; ja: string; reward: { en: string; ja: string } }[];
const MILESTONES: Record<OutdoorArea, Milestones> = { lagoon: LAGOON_MILESTONES, sanctuary: SANCTUARY_MILESTONES };

export function AreaCelebration() {
  const c = useGame((s) => s.areaCelebration);
  if (!c) return null;
  const ms = MILESTONES[c.area][c.milestone - 1];
  if (!ms) return null;
  return (
    <div className="coast-celebration outdoor-celebration ui" data-testid="area-celebration" data-area={c.area} data-milestone={c.milestone} role="status">
      <Icon id={c.milestone === 5 ? "trophy" : "star"} size={44} />
      <b>{ms.en}!</b><Ja>{ms.ja}</Ja>
      <small>🎁 {ms.reward.en}<Ja>{ms.reward.ja}</Ja></small>
    </div>
  );
}

/** A small "need" bar (0–100) with an icon. */
export function NeedBar({ value, icon, label, id }: { value: number; icon: React.ReactNode; label: string; id: string }) {
  const v = Math.round(value);
  return (
    <div className={`bar need ${v >= 70 ? "good" : v >= 40 ? "ok" : "low"}`} data-testid={id} data-value={v} aria-label={`${label} ${v}`}>
      <span className="need-icon" aria-hidden="true">{icon}</span>
      <div className="track"><div className="fill" style={{ width: `${Math.max(4, v)}%` }} /></div>
    </div>
  );
}
