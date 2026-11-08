import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type LocateResult } from "./api";

export type LocateStatus = "idle" | "locating" | "done" | "denied" | "error";

/** GPS lot identification (pitch slide 4): phone fix -> /api/parking/locate (point-in-outline).
 *  Asks for permission only when `locate()` is called by a tap; if permission was granted earlier,
 *  `auto` locates silently on mount. The student can always override the match by hand. */
export function useLotLocator(auto = true) {
  const [status, setStatus] = useState<LocateStatus>("idle");
  const [result, setResult] = useState<LocateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const run = useCallback(async (ask: boolean) => {
    setError(null);
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted && ask && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { if (ask && alive.current) setStatus("denied"); return null; }
      if (alive.current) setStatus("locating");
      // A recent cached fix is instant; otherwise ask for a fresh, balanced-accuracy fix with a timeout.
      const cached = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 60 });
      const pos = cached ?? await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Location timed out. Step outside or pick the lot manually.")), 15000)),
      ]);
      const r = await api.locate(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      if (alive.current) { setResult(r); setStatus("done"); }
      return r;
    } catch (e) {
      if (alive.current) { setError((e as Error).message); setStatus("error"); }
      return null;
    }
  }, []);

  useEffect(() => { if (auto) run(false); }, [auto, run]);
  const locate = useCallback(() => run(true), [run]);
  return { status, result, error, locate };
}

export const methodLabel = (r: LocateResult) =>
  r.method === "inside_outline" ? "You're inside"
    : r.method === "nearest_outline" ? `${Math.round(r.distance_m ?? 0)} m from`
      : r.on_campus ? "Not in a known lot" : "You're not on North Campus";
