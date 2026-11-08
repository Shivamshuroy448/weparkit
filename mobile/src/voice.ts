import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "./config";
import { useStore } from "./store";

// One voice for the whole app: a new briefing always stops the previous one.
let current: { id: string; stop: () => void } | null = null;
const listeners = new Set<(id: string | null) => void>();
const announce = (id: string | null) => listeners.forEach((l) => l(id));
let audioModeSet = false;

const textUrl = (path: string) => `${API_BASE}${path}${path.includes("?") ? "&" : "?"}text_only=true`;

/** Speaks briefings from /api/voice/*. Uses ElevenLabs audio when the server has a key (the key never
 *  leaves the server); otherwise, or if the audio doesn't load, falls back to the phone's built-in voice
 *  reading the same server-written script, so drive mode never goes silent. */
export function useVoice() {
  const { health } = useStore();
  const [playing, setPlaying] = useState<string | null>(current?.id ?? null);
  useEffect(() => { listeners.add(setPlaying); return () => { listeners.delete(setPlaying); }; }, []);

  const stop = useCallback(() => { current?.stop(); }, []);

  const speakDevice = useCallback(async (path: string, id: string) => {
    let text = "";
    try {
      const r = await fetch(textUrl(path));
      text = r.ok ? ((await r.json()) as { text: string }).text : "";
    } catch { /* fall through */ }
    if (current?.id !== id) return; // superseded while fetching
    if (!text) { current = null; announce(null); return; }
    Speech.speak(text, { rate: 1.0, onDone: () => { if (current?.id === id) { current = null; announce(null); } } });
  }, []);

  const play = useCallback(async (path: string, id: string = path) => {
    current?.stop();
    let finished = false;
    const finish = () => { if (finished) return; finished = true; if (current?.id === id) { current = null; announce(null); } };

    if (health?.voice_enabled === false) {
      current = { id, stop: () => { Speech.stop(); finish(); } };
      announce(id);
      return speakDevice(path, id);
    }

    if (!audioModeSet) {
      audioModeSet = true;
      await setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    }
    const player: AudioPlayer = createAudioPlayer({ uri: API_BASE + path });
    let loaded = false;
    const cleanup = () => { clearTimeout(timeout); sub.remove(); player.remove(); };
    // ElevenLabs outage or bad key shows up as a stream that never loads: switch to the device voice.
    const timeout = setTimeout(() => {
      if (!loaded && current?.id === id) { cleanup(); current = { id, stop: () => { Speech.stop(); finish(); } }; speakDevice(path, id); }
    }, 8000);
    const sub = player.addListener("playbackStatusUpdate", (s) => {
      if (s.isLoaded) loaded = true;
      if (s.didJustFinish) { cleanup(); finish(); }
    });
    current = { id, stop: () => { cleanup(); Speech.stop(); finish(); } };
    announce(id);
    player.play();
  }, [health?.voice_enabled, speakDevice]);

  // `enabled` = ElevenLabs is (or may be) available. Speaking always works thanks to the device fallback,
  // so UI should show Listen controls regardless; use `enabled` only for labels and ElevenLabs-only features.
  return { enabled: health?.voice_enabled !== false, playing, play, stop };
}
