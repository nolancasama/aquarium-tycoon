/**
 * Browser stubs for automated runs: instant text-to-speech, a scripted
 * SpeechRecognition and a granted microphone. Injected with addInitScript.
 *
 * Tests steer recognition through window.__speech:
 *   { say: "do you like apples" } -> one interim + final result
 *   { error: "not-allowed" }       -> a permission error
 *   { say: null }                  -> silence (no-speech)
 *   { say: "...", interimOnly: true } -> only an interim result, never a final one
 *   { delayMs: 1200 }              -> allow time for meter samples
 * Tests steer the local meter through window.__audio.mode:
 *   unavailable / denied / silent / normal / clipping
 * __audio.stops and activeTracks verify stream cleanup; permission controls
 * navigator.permissions independently of the sampled signal.
 */
export const BROWSER_STUBS = `
(() => {
  const w = window;
  w.__speech = { say: null, error: null, interimOnly: false, starts: 0 };
  w.__audio = { mode: 'normal', permission: 'granted', permissionsAvailable: true, contextAvailable: true, requests: 0, stops: 0, activeTracks: 0, frames: 0 };
  w.__ttsSpoken = [];
  const synth = w.speechSynthesis;
  if (synth) {
    // Like Chrome: speaking ends after a while, and cancel() ends it at once.
    const pending = new Set();
    const end = (u) => { if (!pending.has(u)) return; pending.delete(u); u.onend && u.onend(); };
    synth.speak = (u) => { w.__ttsSpoken.push(u.text); pending.add(u); setTimeout(() => end(u), w.__ttsMs ?? 120); };
    synth.cancel = () => { [...pending].forEach(end); };
    synth.getVoices = () => [];
  }
  class FakeRecognition {
    constructor() { this.lang = ''; this.interimResults = false; this.maxAlternatives = 1; this.continuous = false; this._done = false; }
    start() {
      w.__speech.starts++;
      const plan = { ...w.__speech };
      setTimeout(() => {
        if (this._done) return;
        if (plan.error) {
          if (plan.error === 'not-allowed' || plan.error === 'service-not-allowed') w.__audio.permission = 'denied';
          this.onerror && this.onerror({ error: plan.error });
          this._finish();
          return;
        }
        if (plan.say == null) {
          this.onerror && this.onerror({ error: 'no-speech' });
          this._finish();
          return;
        }
        if (plan.interimOnly) {
          const result = [{ transcript: String(plan.say) }];
          result.isFinal = false;
          this.onresult && this.onresult({ resultIndex: 0, results: [result] });
          setTimeout(() => this._finish(), 300);
          return;
        }
        const words = String(plan.say).split(' ');
        const emit = (text, isFinal) => {
          const result = [{ transcript: text }];
          result.isFinal = isFinal;
          this.onresult && this.onresult({ resultIndex: 0, results: [result] });
        };
        emit(words.slice(0, Math.max(1, words.length - 1)).join(' '), false);
        setTimeout(() => {
          if (this._done) return;
          emit(plan.say, true);
          setTimeout(() => this._finish(), 60);
        }, 150);
      }, plan.delayMs ?? 250);
    }
    _finish() { if (this._done) return; this._done = true; this.onend && this.onend(); }
    stop() { setTimeout(() => this._finish(), 30); }
    abort() { this._finish(); }
  }
  w.SpeechRecognition = FakeRecognition;
  w.webkitSpeechRecognition = FakeRecognition;
  const mediaDevices = navigator.mediaDevices || {};
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: mediaDevices });
  mediaDevices.getUserMedia = async () => {
    const a = w.__audio;
    a.requests++;
    if (a.mode === 'unavailable') throw new DOMException('No microphone', 'NotFoundError');
    if (a.mode === 'denied' || a.permission === 'denied') {
      a.permission = 'denied';
      throw new DOMException('Microphone denied', 'NotAllowedError');
    }
    a.permission = 'granted';
    a.activeTracks++;
    let stopped = false;
    const track = { kind: 'audio', stop: () => { if (!stopped) { stopped = true; a.stops++; a.activeTracks--; } } };
    return { __fakeAudioStream: true, getTracks: () => [track], getAudioTracks: () => [track] };
  };
  const nativePermissions = navigator.permissions;
  const query = nativePermissions?.query.bind(nativePermissions);
  const fakePermissions = { query: async (descriptor) => {
    if (descriptor.name === 'microphone') return { state: w.__audio.permission, onchange: null };
    return query ? query(descriptor) : { state: 'prompt', onchange: null };
  } };
  Object.defineProperty(navigator, 'permissions', { configurable: true, get: () => w.__audio.permissionsAvailable ? fakePermissions : undefined });
  const NativeAudioContext = w.AudioContext || w.webkitAudioContext;
  if (NativeAudioContext) {
    class MeterAudioContext extends NativeAudioContext {
      createMediaStreamSource(stream) {
        return stream.__fakeAudioStream ? this.createGain() : super.createMediaStreamSource(stream);
      }
      createAnalyser() {
        const analyser = super.createAnalyser();
        analyser.getFloatTimeDomainData = (samples) => {
          w.__audio.frames++;
          for (let i = 0; i < samples.length; i++) {
            samples[i] = w.__audio.mode === 'silent' ? 0 : w.__audio.mode === 'clipping' ? (i % 2 ? 1 : -1) : Math.sin(i * 0.2) * 0.35;
          }
        };
        return analyser;
      }
    }
    Object.defineProperty(w, 'AudioContext', { configurable: true, get: () => w.__audio.contextAvailable ? MeterAudioContext : undefined });
    Object.defineProperty(w, 'webkitAudioContext', { configurable: true, get: () => w.__audio.contextAvailable ? MeterAudioContext : undefined });
  }
})();
`;
