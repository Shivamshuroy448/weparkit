import { useFocusEffect } from "expo-router";
import { Award, HandHelping } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Switch, View } from "react-native";
import { api, ago, type CrewUser } from "../../src/api";
import Header from "../../src/components/Header";
import { Button, Card, Empty, Pill, Screen, Stat, T, row } from "../../src/components/ui";
import { useStore } from "../../src/store";

const ACTIONS: Record<string, string> = {
  scan: "Scanned a lot", report: "Reported a lot", hazard: "Reported a hazard", verify: "Confirmed a hazard",
  clear: "Cleared a hazard", leaving: "Signalled leaving", assist_help: "Helped push a car", assist_request: "Asked for help",
};

export default function CrewNetwork() {
  const { c, user, notifications, refresh, toast, setUser } = useStore();
  const [board, setBoard] = useState<CrewUser[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try { setBoard((await api.leaderboard()).leaderboard); await refresh("crew"); } catch (e) { toast((e as Error).message, "error"); }
  }, [refresh, toast]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const requests = notifications.filter((n) => n.kind === "assist" && n.title.startsWith("Stuck") && !(n.title.includes(user?.handle ?? "~~")));
  const respond = async (id: number) => {
    if (!user) return;
    setBusy(id);
    try { const r = await api.assist({ user_id: user.id, action: "respond", request_id: id }); toast(`On your way. +${r.points_awarded} XP`); load(); }
    catch (e) { toast((e as Error).message, "error"); } finally { setBusy(null); }
  };
  const toggleHelp = async (v: boolean) => {
    if (!user) return;
    try { setUser(await api.me(user.id, { accepts_assist_requests: v })); } catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <Screen header={<Header kicker="CREW NETWORK" title="Your crew" />} onRefresh={load}>
      {user && (
        <Card tone="accent" style={{ backgroundColor: c.panel2 }}>
          <View style={row.between}>
            <View>
              <T v="mono">ANONYMOUS DEMO PROFILE</T>
              <T v="h1">{user.handle}</T>
            </View>
            <Award size={30} color={c.accent} />
          </View>
          <View style={[row.wrap, { marginTop: 10 }]}>
            <Stat label="XP" value={user.points.toLocaleString()} accent />
            <Stat label="Rank" value={`#${user.rank ?? "—"}`} />
            <Stat label="Reports" value={user.reports_submitted} />
            <Stat label="Verified" value={user.hazards_verified} />
          </View>
          <View style={[row.between, { marginTop: 12 }]}>
            <T v="body">Get "stuck in orbit" requests</T>
            <Switch value={user.accepts_assist_requests} onValueChange={toggleHelp} trackColor={{ true: c.accent, false: c.line }} thumbColor={c.ink} />
          </View>
        </Card>
      )}

      <Card kicker="STUCK IN ORBIT" title="Crew who need a push">
        {requests.length === 0 ? <T v="small">No open requests. Request help from Docking Control if your car is stuck.</T> :
          requests.map((n) => (
            <View key={n.id} style={[row.between, { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.line }]}>
              <View style={{ flex: 1 }}>
                <T v="h3">{n.title.replace("Stuck in orbit: ", "")}</T>
                <T v="small">{n.body} · {ago(n.created_at)}</T>
              </View>
              <Button title="On my way" variant="warn" icon={<HandHelping size={14} color={c.orange} />} onPress={() => respond(n.id)} loading={busy === n.id} />
            </View>
          ))}
      </Card>

      <Card kicker="LEADERBOARD">
        {board.length === 0 ? <Empty title="No crew yet" /> : board.map((u) => (
          <View key={u.id} style={[row.between, { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.line }]}>
            <View style={row.gap}>
              <T v="monoBold" color={u.rank! <= 3 ? c.accent : c.muted} style={{ width: 28 }}>#{u.rank}</T>
              <View>
                <T v="h3" color={u.id === user?.id ? c.accent : undefined}>{u.handle}{u.id === user?.id ? " (you)" : ""}</T>
                <T v="small">{u.reports_submitted} reports · {u.hazards_verified} verified</T>
              </View>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <T v="h3">{u.points.toLocaleString()} XP</T>
              {u.is_seed && <Pill tone="muted">seeded demo crew</Pill>}
            </View>
          </View>
        ))}
      </Card>

      <Card kicker="YOUR MISSION LOG">
        {user?.history?.length ? user.history.map((h, i) => (
          <View key={i} style={[row.between, { paddingVertical: 5 }]}>
            <T v="body">{ACTIONS[h.action] ?? h.action}</T>
            <T v="mono">+{h.points} · {ago(h.at).toUpperCase()}</T>
          </View>
        )) : <T v="small">Scan a lot or report a hazard to earn your first XP.</T>}
      </Card>
    </Screen>
  );
}
