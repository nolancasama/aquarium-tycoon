import { useEffect, useRef, useState } from "react";
import { setGame, toast, updateSettings, useGame } from "../game/store";
import { recognition, HARD_ERRORS, requestMicPermission } from "../audio/recognition";
import { ACTIVITY_RMS, classifyMicAttempt, createMicLevel, markMicWorked } from "../audio/micLevel";
import { tts } from "../audio/tts";
import { audio } from "../audio/audio";
import { judgeSpeech } from "../game/logic/speechMatch";
import { PHRASES } from "../game/logic/english";
import { blockMic } from "../game/flow/ask";
import { ActionTag } from "./ActionTag";
import { Icon } from "./icons";
import { Ja } from "./Ja";
import { ACTION, AUDIO } from "./i18n";
import { MicMeter } from "./MicMeter";
import { SpeakTip } from "./SpeakTip";

export function AudioCheckModal() {
  const check = useGame((s) => s.audioCheck);
  if (!check) return null;
  return <AudioCheck key={check} check={check} />;
}

function AudioCheck({ check }: { check: "setup" | "speaker" | "mic" | "tip" }) {
  const [step, setStep] = useState(check === "setup" ? "speaker" : check);
  const [played, setPlayed] = useState(false);
  const [volumeTip, setVolumeTip] = useState(false);
  const [status, setStatus] = useState<"inactive" | "listening" | "recognised" | "not-recognised" | "unavailable">("inactive");
  const [permission, setPermission] = useState("Not checked yet");
  const [signal, setSignal] = useState<boolean | null>(null);
  const [meterAvailable, setMeterAvailable] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState<"quiet" | "overload" | "neutral">("neutral");
  const [meter] = useState(createMicLevel);
  const stop = useRef<(() => void) | null>(null);
  const generation = useRef(0);
  const running = useRef(false);
  const blocked = useGame((s) => s.micState === "blocked");
  const supported = recognition.supported;

  const release = () => {
    generation.current++;
    running.current = false;
    stop.current?.();
    stop.current = null;
    meter.stop();
    audio.setListening(false);
    tts.cancel();
  };
  useEffect(() => () => { release(); }, []); // one owner for streams and pending permission results

  const close = () => {
    release();
    if (check === "setup") updateSettings({ audioSetupDone: true });
    setGame({ audioCheck: null });
  };
  const next = () => {
    release();
    if (check === "setup" && step === "speaker" && !supported) {
      setGame({ micState: "unsupported" });
      toast({ en: "Speech recognition is unavailable. You can tap answers.", ja: "こえでの こたえは つかえないよ。タップで あそべるよ。", tone: "info" }, 6000);
      close();
    }
    else if (check === "setup" && step === "speaker") setStep("mic");
    else close();
  };

  const testMic = async () => {
    if (running.current || blocked) return;
    release();
    const token = generation.current;
    running.current = true;
    setStatus("listening");
    setPermission("Checking permission…");
    setSignal(null);
    setMeterAvailable(null);
    setFeedback("neutral");
    // This explicit check may request permission. Its temporary stream is closed
    // before recognition and the local meter open; gameplay never does this.
    const allowed = await requestMicPermission();
    if (generation.current !== token) return;
    if (allowed === "denied") {
      blockMic();
      setPermission("Microphone permission denied");
      setStatus("unavailable");
      running.current = false;
      return;
    }
    setPermission(allowed === "granted" ? "Microphone permission granted" : "Microphone signal check unavailable");
    if (allowed === "granted") {
      markMicWorked();
      setGame({ micState: "ready" });
    }
    let recognised = false;
    let hard = false;
    let ended = false;
    audio.setListening(true);
    const end = () => {
      if (ended) return;
      ended = true;
      const summary = meter.stop();
      if (generation.current !== token) return;
      audio.setListening(false);
      stop.current = null;
      running.current = false;
      setSignal(summary ? summary.activeMs > 0 || summary.peakRms >= ACTIVITY_RMS : null);
      setFeedback(classifyMicAttempt(summary));
      setStatus(recognised ? "recognised" : hard ? "unavailable" : "not-recognised");
    };
    const cancel = recognition.listen({
      onResult(alts) {
        if (generation.current !== token) return;
        markMicWorked();
        if (judgeSpeech(alts, [{ ...PHRASES.itsFish, en: "I like fish!" }]).kind === "match") {
          recognised = true;
          const cancelListening = stop.current;
          end();
          cancelListening?.();
        }
      },
      onError(error) {
        if (generation.current !== token || !HARD_ERRORS.has(error)) return;
        hard = true;
        blockMic();
        setPermission("Microphone unavailable or permission denied");
      },
      onEnd: end
    }, 7000);
    stop.current = () => { cancel(); end(); };
    if (ended) { stop.current(); stop.current = null; return; }
    if (allowed === "granted") {
      const result = await meter.start();
      if (generation.current !== token || ended) return;
      setMeterAvailable(result === "available");
    } else setMeterAvailable(false);
  };

  return <div className="audio-check-wrap ui">
    <div className="panel audio-check" role="dialog" aria-label="Audio check" data-testid="audio-check">
      {step === "tip" ? <><SpeakTip always /><button className="primary" onClick={close}>Done <Ja>おわり</Ja></button></> : step === "speaker" ? <>
        <h2><Icon id="speaker" size={30} />{AUDIO.speaker.en}<Ja>{AUDIO.speaker.ja}</Ja></h2>
        <p className="audio-model">Hello! Welcome!</p>
        {tts.available ? <button className="primary" data-testid="audio-speaker-play" onClick={() => { tts.cancel(); setPlayed(true); void tts.speak("Hello! Welcome!", { pitch: 1.3, rate: 0.9 }); }}><Icon id="speaker" size={24} />{played ? "Replay" : "Play Sound"}<Ja>{played ? "もう いちど" : "こえを きく"}</Ja></button>
          : <p>Voice playback is unavailable in this browser.<Ja>この ブラウザでは こえを だせないよ。</Ja></p>}
        <div className="audio-buttons">
          <button className="primary" data-testid="audio-speaker-hear" onClick={next}>I can hear!<Ja>きこえる！</Ja></button>
          <button className="secondary" data-testid="audio-speaker-cant" onClick={() => setVolumeTip(true)}>Can't hear<Ja>きこえない</Ja></button>
        </div>
        {volumeTip && <p lang="ja">Chromebookの おとの おおきさを たしかめてね。</p>}
        {(volumeTip || !tts.available) && <button className="secondary" data-testid="audio-next" onClick={next}>Next<Ja>つぎへ</Ja></button>}
      </> : <>
        <h2>{AUDIO.mic.en}<Ja>{AUDIO.mic.ja}</Ja></h2>
        {!supported ? <p>Speech recognition is unavailable. You can tap answers.<Ja>こえでの こたえは つかえないよ。タップで あそべるよ。</Ja></p> : <>
          <SpeakTip always />
          <div className="audio-target"><ActionTag kind="say" {...ACTION.sayThis} /><strong>I like fish!</strong></div>
          <div className="audio-buttons">
            <button className={`mic ${status === "listening" ? "on" : ""}`} data-testid="audio-mic" aria-label="Test microphone" disabled={status === "listening" || blocked} onClick={() => void testMic()}><Icon id="mic" size={32} /></button>
            <MicMeter meter={meter} state={status} hidden={meterAvailable === false} />
          </div>
          <div className="audio-results" role="status" aria-live="polite">
            <p data-testid="audio-permission">{blocked ? "Microphone unavailable or permission denied" : permission}<Ja>{blocked ? "マイクは つかえないよ。タップで あそぼう。" : "マイクの きょか・つかえるか"}</Ja></p>
            <p data-testid="audio-signal">{signal === true ? "Sound received" : signal === false ? "No sound detected" : meterAvailable === false ? "Signal meter unavailable" : "Sound: not checked yet"}<Ja>{signal === true ? "おとが とどいたよ" : signal === false ? "おとは とどかなかったよ" : "おとの チェック"}</Ja></p>
            <p data-testid="audio-recognised">{status === "recognised" ? AUDIO.recognised.en : status === "not-recognised" && signal ? AUDIO.signalOnly.en : status === "not-recognised" ? "Not recognised. Let's try again!" : "Words: not recognised yet"}<Ja>{status === "recognised" ? AUDIO.recognised.ja : status === "not-recognised" && signal ? AUDIO.signalOnly.ja : "ことばの チェック"}</Ja></p>
            {status === "not-recognised" && feedback !== "neutral" && <p>{AUDIO[feedback].en}<Ja>{AUDIO[feedback].ja}</Ja></p>}
          </div>
          {(status === "not-recognised" || status === "unavailable") && <button className="secondary" disabled={blocked} data-testid="audio-retry" onClick={() => void testMic()}>Retry<Ja>もう いちど</Ja></button>}
        </>}
      </>}
      {step !== "tip" && <button className="secondary" data-testid="audio-skip" onClick={next}>{step === "mic" && (status === "recognised" || !supported) ? "Next" : "Skip"}<Ja>{step === "mic" && (status === "recognised" || !supported) ? "つぎへ" : "スキップ"}</Ja></button>}
    </div>
  </div>;
}
