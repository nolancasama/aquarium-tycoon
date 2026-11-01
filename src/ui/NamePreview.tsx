import { useEffect, useRef, useState } from "react";
import { tts } from "../audio/tts";
import { SPECIES } from "../game/data/fish";
import { getGame } from "../game/store";
import type { SpeciesId } from "../game/types";
import { FishPicture } from "./Portraits";
import { Ja } from "./Ja";
import { Icon } from "./icons";
import { canSpeakPreview, previewName, previewText } from "./namePreviewLogic";
import "./NamePreview.css";

/** Local vocabulary feedback: never dispatches an answer or a shop action. */
export function NamePreview({ species }: { species: SpeciesId }) {
  const def = SPECIES[species];
  const [tap, setTap] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function preview() {
    setTap((n) => n + 1);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setTap(0), 1800);
    const { settings, prompt } = getGame();
    // No global cancel: a queued game prompt must keep its own speech.
    tts.cancelPreview();
    if (canSpeakPreview({ available: tts.available, muted: settings.sfx === 0,
      listening: prompt?.status === "listening", speaking: tts.isSpeaking() })) {
      void tts.speak(previewText(def.name), { rate: 0.82, preview: true });
    }
  }

  return <div className="name-preview">
    <button type="button" className="name-preview-button" aria-label={`Hear: ${previewName(def.name)}`}
      onClick={(e) => { e.stopPropagation(); preview(); }}
      onKeyDown={(e) => e.stopPropagation()} onKeyUp={(e) => e.stopPropagation()}>
      <span key={tap} className={tap ? "name-preview-picture pulse" : "name-preview-picture"}>
        <FishPicture species={species} size={110} />
      </span>
      <Icon id="speaker" size={16} className="name-preview-speaker" />
    </button>
    {tap > 0 && <span className="name-preview-label" role="status">
      {previewName(def.name)}<Ja>{def.ja}</Ja>
    </span>}
  </div>;
}
