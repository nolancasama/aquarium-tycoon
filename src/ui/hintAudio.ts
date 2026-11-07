import { tts } from "../audio/tts";
import { speak } from "../game/flow/ask";

/** Replay existing English hint text without interrupting a game question.
 * TTS is shared with prompts, so avoid queuing speech behind active playback. */
export function playHintAudio(text: string): void {
  if (!text.trim() || !tts.available || tts.isSpeaking()) return;
  void speak(text, "pico", true);
}
