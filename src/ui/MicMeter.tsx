import { useEffect, useRef } from "react";
import { ACTIVITY_RMS, type createMicLevel } from "../audio/micLevel";

export type MeterState = "inactive" | "listening" | "recognised" | "not-recognised" | "unavailable";

/** Audio frames only write the DOM; React renders session transitions. */
export function MicMeter({ meter, state, hidden = false }: { meter: ReturnType<typeof createMicLevel>; state: MeterState; hidden?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--mic-level", "0");
    el.dataset.state = state;
    el.hidden = hidden;
    return meter.subscribe(({ rms }) => {
      el.hidden = hidden || (state === "listening" && !meter.available);
      el.style.setProperty("--mic-level", String(Math.min(1, rms * 5)));
      el.dataset.state = state === "listening" && rms >= ACTIVITY_RMS ? "sound" : state;
    });
  }, [meter, state, hidden]);
  return <span ref={ref} className="mic-meter" hidden={hidden} data-state={state} role="img" aria-label={`Microphone: ${state}`}><i /><i /><i /><i /><i /></span>;
}
