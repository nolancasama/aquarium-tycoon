/** Local, ephemeral microphone levels. Samples never leave this analyser frame. */
export interface MicLevel {
  rms: number;
  clipFraction: number;
}

export interface MicLevelSummary {
  peakRms: number;
  activeMs: number;
  sustainedClipMs: number;
  durationMs: number;
}

// Conservative cues: AGC can make normal speech loud, so only clipped samples
// count as overload. Short attempts and brief sounds never get corrective cues.
export const ACTIVITY_RMS = 0.012;
export const CLIP_SAMPLE_LEVEL = 0.99;
export const CLIP_FRACTION = 0.02;
export const SUSTAINED_CLIP_MS = 400;
export const MIN_FEEDBACK_MS = 3000;
export const QUIET_MAX_ACTIVE_MS = 100;
const SAMPLE_INTERVAL_MS = 1000 / 15;

export function classifyMicAttempt(summary: MicLevelSummary | null): "quiet" | "overload" | "neutral" {
  if (!summary || summary.durationMs < MIN_FEEDBACK_MS) return "neutral";
  if (summary.sustainedClipMs >= SUSTAINED_CLIP_MS) return "overload";
  if (summary.activeMs <= QUIET_MAX_ACTIVE_MS) return "quiet";
  return "neutral";
}

let micWorked = false;

/** Recognition has received a result or the explicit mic check received audio. */
export function markMicWorked(): void {
  micWorked = true;
}

/** Gameplay must never use the meter to cause an additional permission prompt. */
export async function canMeterDuringRecognition(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  if (!navigator.permissions?.query) return micWorked;
  try {
    const permission = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return permission.state === "granted";
  } catch {
    return false;
  }
}

interface Session {
  cancelled: boolean;
  stream?: MediaStream;
  context?: AudioContext;
  source?: MediaStreamAudioSourceNode;
  analyser?: AnalyserNode;
  timer?: ReturnType<typeof setInterval>;
  startedAt?: number;
  summary: MicLevelSummary;
}

function release(session: Session): void {
  session.cancelled = true;
  if (session.timer !== undefined) clearInterval(session.timer);
  try { session.source?.disconnect(); } catch { /* already disconnected */ }
  try { session.analyser?.disconnect(); } catch { /* already disconnected */ }
  try {
    session.stream?.getTracks().forEach((track) => {
      try { track.stop(); } catch { /* continue stopping every track */ }
    });
  } catch { /* unavailable stream */ }
  try {
    const closing = session.context?.close();
    void closing?.catch(() => {});
  } catch { /* unavailable/closed context */ }
}

export function createMicLevel() {
  let session: Session | null = null;
  let starting: Promise<"available" | "unavailable"> | null = null;
  let latest: MicLevel = { rms: 0, clipFraction: 0 };
  const listeners = new Set<(level: MicLevel) => void>();
  const publish = (level: MicLevel) => {
    latest = level;
    for (const listener of listeners) {
      try { listener(level); } catch { /* UI cannot interrupt cleanup/audio */ }
    }
  };

  return {
    get latest(): MicLevel { return latest; },
    get available(): boolean { return session?.startedAt !== undefined && !session.cancelled; },
    subscribe(listener: (level: MicLevel) => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    start(): Promise<"available" | "unavailable"> {
      if (starting) return starting;
      if (session?.startedAt !== undefined) return Promise.resolve("available");
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof window === "undefined") {
        return Promise.resolve("unavailable");
      }
      const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return Promise.resolve("unavailable");
      const current: Session = {
        cancelled: false,
        summary: { peakRms: 0, activeMs: 0, sustainedClipMs: 0, durationMs: 0 }
      };
      session = current;
      const pending = (async (): Promise<"available" | "unavailable"> => {
        try {
          current.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (current.cancelled) { release(current); return "unavailable"; }
          current.context = new AudioCtor();
          current.source = current.context.createMediaStreamSource(current.stream);
          const analyser = current.context.createAnalyser();
          current.analyser = analyser;
          analyser.fftSize = 1024;
          current.source.connect(analyser);
          if (current.context.state === "suspended") await current.context.resume();
          if (current.cancelled) { release(current); return "unavailable"; }
          const frame = new Float32Array(analyser.fftSize);
          current.startedAt = performance.now();
          let previousAt = current.startedAt;
          const sample = () => {
            if (current.cancelled) return;
            try {
              analyser.getFloatTimeDomainData(frame);
              let squareSum = 0;
              let clipped = 0;
              for (const value of frame) {
                squareSum += value * value;
                if (Math.abs(value) >= CLIP_SAMPLE_LEVEL) clipped++;
              }
              const rms = Math.sqrt(squareSum / frame.length);
              const clipFraction = clipped / frame.length;
              const now = performance.now();
              // Do not attribute a long background-tab pause to one audio frame.
              const elapsed = Math.min(now - previousAt, SAMPLE_INTERVAL_MS * 2);
              previousAt = now;
              current.summary.durationMs = now - current.startedAt!;
              current.summary.peakRms = Math.max(current.summary.peakRms, rms);
              if (rms >= ACTIVITY_RMS) current.summary.activeMs += elapsed;
              if (clipFraction > CLIP_FRACTION) current.summary.sustainedClipMs += elapsed;
              publish({ rms, clipFraction });
            } catch {
              release(current);
              if (session === current) session = null;
              publish({ rms: 0, clipFraction: 0 });
            }
          };
          sample();
          if (current.cancelled) return "unavailable";
          current.timer = setInterval(sample, SAMPLE_INTERVAL_MS);
          return "available";
        } catch {
          release(current);
          if (session === current) session = null;
          return "unavailable";
        }
      })();
      starting = pending;
      void pending.then(() => { if (starting === pending) starting = null; });
      return pending;
    },
    stop(): MicLevelSummary | null {
      const current = session;
      session = null;
      starting = null;
      if (!current) return null;
      const summary = current.startedAt === undefined ? null : {
        ...current.summary,
        durationMs: performance.now() - current.startedAt
      };
      release(current);
      publish({ rms: 0, clipFraction: 0 });
      return summary;
    }
  };
}
