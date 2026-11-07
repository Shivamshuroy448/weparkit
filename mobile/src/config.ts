import Constants from "expo-constants";
import { Platform } from "react-native";

/** Resolve the backend URL:
 *  1. EXPO_PUBLIC_API_URL if set (recommended for builds / tunnels)
 *  2. the machine running Metro (Expo Go on a phone on the same Wi-Fi), port 8000
 *  3. emulator/simulator fallbacks */
function resolve(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, "");
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  // With `expo start --tunnel` the host is an ngrok/exp.direct domain that only proxies Metro, not :8000.
  const isTunnel = !!host && /(\.exp\.direct|ngrok|\.ngrok-free\.app)$/.test(host);
  if (isTunnel) console.warn("[IceStation] Expo tunnel detected: set EXPO_PUBLIC_API_URL to a public backend URL (e.g. a cloudflared/ngrok tunnel to :8000).");
  if (host && !isTunnel && host !== "localhost" && host !== "127.0.0.1") return `http://${host}:8000`;
  if (Platform.OS === "android") return "http://10.0.2.2:8000";
  return "http://127.0.0.1:8000";
}

export const API_BASE = resolve();
export const WS_BASE = API_BASE.replace(/^http/, "ws");
