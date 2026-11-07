import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { api, type CrewUser, type Hazard, type Health, type LotsResponse, type Meta, type Notification, type SystemState, type Weather } from "./api";
import { WS_BASE } from "./config";
import { palette, type Palette } from "./theme";

export interface Toast { id: number; kind: "ok" | "error" | "info"; text: string }
type Resource = "lots" | "state" | "hazards" | "notifications" | "weather" | "meta" | "health" | "crew";

interface Store {
  lots: LotsResponse | null; state: SystemState | null; hazards: Hazard[]; notifications: Notification[];
  weather: Weather | null; meta: Meta | null; health: Health | null; user: CrewUser | null;
  backendDown: string | null; toasts: Toast[]; c: Palette;
  toast: (text: string, kind?: Toast["kind"]) => void; dismiss: (id: number) => void;
  refresh: (...what: Resource[]) => Promise<void>; setUser: (u: CrewUser) => void;
  unread: number; markRead: () => void;
}

const Ctx = createContext<Store | null>(null);
const USER_KEY = "icestation_user_id";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [lots, setLots] = useState<LotsResponse | null>(null);
  const [state, setState] = useState<SystemState | null>(null);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [user, setUser] = useState<CrewUser | null>(null);
  const [backendDown, setBackendDown] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lastSeen, setLastSeen] = useState(0);
  const tid = useRef(1);

  const toast = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = tid.current++;
    setToasts((t) => [...t.slice(-2), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6500 : 3800);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const loadUser = useCallback(async () => {
    const stored = Number(await AsyncStorage.getItem(USER_KEY)) || null;
    const u = await api.me(stored);
    await AsyncStorage.setItem(USER_KEY, String(u.id));
    setUser(u);
  }, []);

  const refresh = useCallback(async (...what: Resource[]) => {
    const all: Resource[] = what.length ? what : ["lots", "state", "hazards", "notifications", "weather"];
    const results = await Promise.allSettled(all.map((r): Promise<unknown> => {
      switch (r) {
        case "lots": return api.lots().then(setLots);
        case "state": return api.state().then(setState);
        case "hazards": return api.hazards().then((d) => setHazards(d.hazards));
        case "notifications": return api.notifications().then((d) => setNotifications(d.notifications));
        case "weather": return api.weather().then(setWeather);
        case "meta": return api.meta().then(setMeta);
        case "health": return api.health().then(setHealth);
        case "crew": return loadUser();
      }
    }));
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    const reason = failed?.reason as { status?: number; message?: string } | undefined;
    setBackendDown(reason?.status === 0 ? reason.message ?? "Backend unreachable" : null);
  }, [loadUser]);

  // initial load, polling fallback, and refresh when the app returns to the foreground
  useEffect(() => {
    refresh("lots", "state", "hazards", "notifications", "weather", "meta", "health", "crew");
    const t = setInterval(() => refresh("lots", "state", "hazards", "notifications"), 15000);
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") refresh(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [refresh]);

  // WebSocket push: every phone at the table updates within a second
  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      ws = new WebSocket(`${WS_BASE}/ws`);
      ws.onmessage = (e) => {
        try {
          const { event } = JSON.parse(String(e.data)) as { event: string };
          if (event === "crew") refresh("crew");
          else if (event === "satellite") refresh("weather", "state");
          else if (["lots", "state", "hazards", "notifications"].includes(event)) refresh(event as Resource);
        } catch { /* ignore */ }
      };
      ws.onclose = () => { if (!closed) retry = setTimeout(connect, 4000); };
    };
    connect();
    return () => { closed = true; clearTimeout(retry); ws?.close(); };
  }, [refresh]);

  const primed = useRef(false);
  useEffect(() => {
    if (!primed.current && notifications.length) { primed.current = true; setLastSeen(notifications[0].id); }
  }, [notifications]);
  const unread = notifications.filter((n) => n.id > lastSeen).length;
  const markRead = useCallback(() => setLastSeen(notifications[0]?.id ?? 0), [notifications]);
  const c = useMemo(() => palette(state?.mode === "ice"), [state?.mode]);

  const value = useMemo<Store>(() => ({
    lots, state, hazards, notifications, weather, meta, health, user, backendDown, toasts, c,
    toast, dismiss, refresh, setUser, unread, markRead,
  }), [lots, state, hazards, notifications, weather, meta, health, user, backendDown, toasts, c, toast, dismiss, refresh, unread, markRead]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}
