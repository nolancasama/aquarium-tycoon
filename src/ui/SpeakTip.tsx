import { useEffect, useState } from "react";
import { getGame, updateSettings } from "../game/store";
import { Icon } from "./icons";
import { Ja } from "./Ja";
import { AUDIO } from "./i18n";

export function SpeakTip({ always = false }: { always?: boolean }) {
  const [visible, setVisible] = useState(() => always || !getGame().settings.speakTipSeen);
  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => {
      updateSettings({ speakTipSeen: true });
      if (!always) setVisible(false);
    }, 6000);
    return () => { window.clearTimeout(timer); updateSettings({ speakTipSeen: true }); };
  }, [visible, always]);
  if (!visible) return null;
  return <div className="speak-tip" data-testid="speak-tip">
    <Icon id="mic" size={30} />
    <span><b>{AUDIO.speakClearly.en}</b><Ja>{AUDIO.speakClearly.ja}</Ja><span>{AUDIO.normalVoice.en}</span><Ja>{AUDIO.normalVoice.ja}</Ja></span>
    {!always && <button className="round" aria-label="Dismiss speaking tip" onClick={() => { updateSettings({ speakTipSeen: true }); setVisible(false); }}><Icon id="check" size={20} /></button>}
  </div>;
}
