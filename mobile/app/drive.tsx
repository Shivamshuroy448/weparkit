import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import * as Haptics from "expo-haptics";
import { useKeepAwake } from "expo-keep-awake";
import { router, useLocalSearchParams } from "expo-router";
import { Accelerometer } from "expo-sensors";
import { ArrowDown, ArrowLeftRight, ArrowUp, Hand, Mic, Smartphone, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Linking, PanResponder, Platform, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, askCopilot, availabilityTone, directionsUrl, hhmm12, lotFull, sentence, voicePaths, type Recommendation } from "../src/api";
import { Ufo } from "../src/components/SpaceArt";
import Starfield from "../src/components/Starfield";
import { Badge, T, row } from "../src/components/ui";
import { useStore } from "../src/store";
import { radius, space } from "../src/theme";
import { useVoice } from "../src/voice";

const SWIPE = 60;         // px before a drag counts as a swipe
const TAP_SLOP = 14;      // px of wobble still treated as a tap
const LONG_PRESS = 650;   // ms
const SHAKE_G = 2.2;      // acceleration magnitude (g) that counts as a shake
const SHAKE_COOLDOWN = 2500;
const LISTEN_MS = 5000;   // spoken questions are short; a fixed window is predictable while driving

const buzz = (kind: "tap" | "ok" = "tap") =>
  (kind === "ok" ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)).catch(() => {});

type Phase = "idle" | "listening" | "thinking";

/** Eyes-free driving screen. The whole surface is one gesture pad and everything is spoken back.
 *  tap = briefing · swipe ←/→ = other lots · swipe ↑ = directions · swipe ↓ = ask a question
 *  long-press = stop · shake = repeat. Also speaks first when ice season starts or the lot fills up. */
export default function DriveMode() {
  useKeepAwake();
  const p = useLocalSearchParams<{ destination?: string; arrival?: string; accessible?: string }>();
  const destination = p.destination || "Davis Hall";
  const accessible = p.accessible === "true";
  const { c, lots, state, toast } = useStore();
  const voice = useVoice();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [idx, setIdx] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState<string | null>(null);

  const load = useCallback(() => {
    api.recommend({ destination, arrival: p.arrival ?? "", accessible }).then(setRec).catch((e) => toast((e as Error).message, "error"));
  }, [destination, p.arrival, accessible, toast]);
  useEffect(() => { load(); }, [load]);

  const options = useMemo(() => (rec?.all ?? []).filter((e) => !e.accessible_blocked), [rec]);
  const cur = options[idx];
  const lot = lots?.lots.find((l) => l.slug === cur?.slug);

  const flash = (text: string) => { setHint(text); setTimeout(() => setHint((h) => (h === text ? null : h)), 1400); };

  const speak = (i: number) => {
    const e = options[i];
    if (!e || !rec) return;
    if (i === 0) return voice.play(voicePaths.briefing(destination, p.arrival, accessible), "drive");
    const l = lots?.lots.find((x) => x.slug === e.slug);
    if (l) voice.play(voicePaths.lot(l.id), "drive");
  };

  // Speak the briefing as soon as the recommendation arrives.
  const spokeFirst = useRef(false);
  useEffect(() => { if (rec && options.length && !spokeFirst.current) { spokeFirst.current = true; speak(0); } }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => voice.stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- voice questions (ElevenLabs STT)
  const listen = useRef<{ active: boolean; timer: ReturnType<typeof setTimeout> | null }>({ active: false, timer: null });

  const finishAsk = async () => {
    const l = listen.current;
    if (!l.active) return;
    l.active = false;
    if (l.timer) clearTimeout(l.timer);
    setPhase("thinking");
    try { await recorder.stop(); } catch { /* already stopped */ }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    const uri = recorder.uri;
    if (!uri) { setPhase("idle"); return; }
    try {
      const res = await askCopilot({ audioUri: uri, destination, arrival: p.arrival, accessible });
      setHeard(res.transcript || "(didn't catch that)");
      if (res.lot) {
        const i = options.findIndex((o) => o.slug === res.lot!.slug);
        if (i >= 0) setIdx(i);
      }
      voice.play(res.speech_path, "drive");
      if (res.action === "directions" && res.lot) {
        const { lat, lng } = res.lot;
        setTimeout(() => Linking.openURL(directionsUrl(lat, lng)).catch(() => {}), 1800);
      }
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setPhase("idle");
    }
  };

  const startAsk = async () => {
    if (listen.current.active) return finishAsk();
    if (!voice.enabled) return toast("Voice questions need the ElevenLabs key on the server.", "info");
    voice.stop();
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return toast("Microphone access is off. Enable it in Settings to ask questions.", "error");
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e) {
      return toast(`Couldn't start the microphone: ${(e as Error).message}`, "error");
    }
    listen.current = { active: true, timer: setTimeout(() => { finishAsk(); }, LISTEN_MS) };
    setHeard(null);
    setPhase("listening");
    buzz();
  };

  // ---------------------------------------------------------------- proactive alerts
  const prevMode = useRef(state?.mode);
  useEffect(() => {
    const prev = prevMode.current;
    prevMode.current = state?.mode;
    if (!prev || !state || prev === state.mode) return;
    if (state.mode === "ice") { flash("Ice season on"); voice.play(voicePaths.alert("ice_on", destination), "drive"); load(); }
    else if (prev === "ice") { flash("Ice season off"); voice.play(voicePaths.alert("ice_off", destination), "drive"); load(); }
  }, [state?.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const wasFull = useRef<Record<number, boolean>>({});
  useEffect(() => {
    const target = lots?.lots.find((l) => l.slug === options[0]?.slug);
    if (!target) return;
    const full = lotFull(target) || target.occupancy_pct >= 95;
    const before = wasFull.current[target.id];
    wasFull.current[target.id] = full;
    if (before === false && full) { flash(`${target.name} filling up`); voice.play(voicePaths.alert("lot_full", destination, target.id), "drive"); load(); }
  }, [lots, options]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- gestures
  // Rebuilt every render so the (once-created) PanResponder always calls current state.
  const actions = useRef({ tap: () => {}, next: (_: 1 | -1) => {}, directions: () => {}, stop: () => {}, ask: () => {} });
  actions.current = {
    tap: () => {
      if (listen.current.active) { finishAsk(); return; }   // tap while listening = done talking
      buzz(); flash("Repeating"); speak(idx);
    },
    next: (dir) => {
      const n = options.length;
      if (!n) return;
      const i = (idx + dir + n) % n;
      buzz(); setIdx(i); flash(dir > 0 ? "Next lot" : "Previous lot"); speak(i);
    },
    directions: () => {
      if (!lot) return;
      buzz("ok"); flash("Opening Google Maps");
      Linking.openURL(directionsUrl(lot.lat, lot.lng)).catch(() => toast("Couldn't open Google Maps.", "error"));
    },
    stop: () => { buzz(); flash("Stopped"); voice.stop(); },
    ask: () => { startAsk(); },
  };

  const pan = useMemo(() => {
    let start = 0;
    let longTimer: ReturnType<typeof setTimeout> | null = null;
    let longFired = false;
    const clear = () => { if (longTimer) clearTimeout(longTimer); longTimer = null; };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        start = Date.now(); longFired = false;
        longTimer = setTimeout(() => { longFired = true; actions.current.stop(); }, LONG_PRESS);
      },
      onPanResponderMove: (_, g) => { if (Math.abs(g.dx) > TAP_SLOP || Math.abs(g.dy) > TAP_SLOP) clear(); },
      onPanResponderRelease: (_, g) => {
        clear();
        if (longFired) return;
        const ax = Math.abs(g.dx), ay = Math.abs(g.dy);
        if (g.dy < -SWIPE && ay > ax) return actions.current.directions();
        if (g.dy > SWIPE && ay > ax) return actions.current.ask();
        if (ax > SWIPE && ax > ay) return actions.current.next(g.dx < 0 ? 1 : -1);
        if (ax < TAP_SLOP && ay < TAP_SLOP && Date.now() - start < LONG_PRESS) return actions.current.tap();
      },
      onPanResponderTerminate: clear,
    });
  }, []);

  // Shake to repeat (native only; browsers rarely expose the accelerometer without a permission prompt).
  useEffect(() => {
    if (Platform.OS === "web") return;
    let last = 0;
    let sub: { remove: () => void } | null = null;
    Accelerometer.isAvailableAsync().then((ok) => {
      if (!ok) return;
      Accelerometer.setUpdateInterval(120);
      sub = Accelerometer.addListener(({ x, y, z }) => {
        const now = Date.now();
        if (Math.sqrt(x * x + y * y + z * z) > SHAKE_G && now - last > SHAKE_COOLDOWN) { last = now; actions.current.tap(); }
      });
    }).catch(() => {});
    return () => sub?.remove();
  }, []);

  const speaking = voice.playing === "drive";
  const status = phase === "listening" ? "Listening… ask your question"
    : phase === "thinking" ? "Thinking…"
      : speaking ? "Speaking…" : hint;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <Starfield />
      <View style={[row.between, { paddingHorizontal: space.lg, paddingTop: space.sm }]}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Exit drive mode" hitSlop={12}
          style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
          <X size={24} color={c.text} />
        </Pressable>
        <View style={{ alignItems: "flex-end" }}>
          <T v="label">Drive mode · {destination}</T>
          <T v="caption">{voice.enabled ? "ElevenLabs voice co-pilot" : "Device voice"}</T>
        </View>
      </View>

      <View {...pan.panHandlers} style={{ flex: 1, justifyContent: "center", paddingHorizontal: space.xl, gap: space.lg }}
        accessibilityRole="adjustable"
        accessibilityLabel="Gesture pad. Tap to hear the briefing, swipe left or right for other lots, swipe up for directions, swipe down to ask a question, long press to stop."
        accessibilityActions={[{ name: "activate" }, { name: "increment" }, { name: "decrement" }, { name: "magicTap" }]}
        onAccessibilityAction={(e) => {
          const a = e.nativeEvent.actionName;
          if (a === "activate") actions.current.tap();
          else if (a === "increment") actions.current.next(1);
          else if (a === "decrement") actions.current.next(-1);
          else if (a === "magicTap") actions.current.ask();
        }}>
        {!cur ? (
          <View style={{ alignItems: "center", gap: space.md }}><Ufo size={90} /><T v="body" color={c.textMuted}>Finding the best lot…</T></View>
        ) : (
          <>
            <View style={row.between}>
              <T v="label">{idx === 0 ? "Best option" : `Option ${idx + 1} of ${options.length}`}</T>
              <Badge tone={availabilityTone(cur.label)}>{sentence(cur.label)}</Badge>
            </View>
            <T v="title" style={{ fontSize: 46, lineHeight: 52 }} numberOfLines={2}>{cur.name}</T>
            <T v="heading" color={c.textMuted} style={{ fontSize: 24 }}>~{cur.expected_open_spaces} spaces open</T>
            <View style={{ gap: 2 }}>
              <T v="label">Leave by</T>
              <T v="title" color={c.accent} style={{ fontSize: 56, lineHeight: 62, fontVariant: ["tabular-nums"] }}>{hhmm12(cur.recommended_departure)}</T>
            </View>
          </>
        )}
        <View style={{ minHeight: 64, gap: 4 }}>
          {status && (
            <View style={row.gap}>
              {phase === "listening" ? <Mic size={22} color={c.danger} /> : (speaking || phase === "thinking") ? <Ufo size={30} beam={phase === "thinking"} /> : null}
              <T v="body" color={phase === "listening" ? c.danger : c.accent}>{status}</T>
            </View>
          )}
          {heard && phase !== "listening" && <T v="caption" numberOfLines={2}>You asked: “{heard}”</T>}
        </View>
      </View>

      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.sm }}>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Gesture icon={<Hand size={18} color={c.text} />} label="Tap: hear it" />
          <Gesture icon={<ArrowLeftRight size={18} color={c.text} />} label="Swipe: other lots" />
        </View>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Gesture icon={<ArrowDown size={18} color={c.text} />} label="Swipe down: ask" />
          <Gesture icon={<ArrowUp size={18} color={c.text} />} label="Swipe up: directions" />
        </View>
        <View style={[row.gap, { justifyContent: "center" }]}>
          <Smartphone size={13} color={c.textFaint} />
          <T v="caption" color={c.textFaint}>Long-press to stop · shake to repeat · mount your phone before driving</T>
        </View>
      </View>
    </SafeAreaView>
  );
}

function Gesture({ icon, label }: { icon: ReactNode; label: string }) {
  const { c } = useStore();
  return (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, paddingVertical: space.md,
      borderRadius: radius.md, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: c.border }}>
      {icon}
      <T v="caption">{label}</T>
    </View>
  );
}
