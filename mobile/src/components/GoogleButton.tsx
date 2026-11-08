// Native "Continue with Google" (iOS / Android). Gets a Google ID token via expo-auth-session and hands it
// to the backend, which verifies it with Google. Web uses GoogleButton.web.tsx (Google's own button).
//
// Expo Go limitation: Google rejects Expo Go's exp:// redirect, so this only works in a development or
// store build with EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID / EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID set. In Expo Go
// we show a short note instead of a button that would fail.
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { Button, T } from "./ui";

WebBrowser.maybeCompleteAuthSession();

const ANDROID_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const IOS_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export default function GoogleButton({ webClientId, onIdToken, onError }: {
  webClientId?: string; onIdToken: (token: string) => Promise<void>; onError: (msg: string) => void;
}) {
  const nativeId = Platform.OS === "ios" ? IOS_ID : ANDROID_ID;
  if (inExpoGo || !nativeId) {
    return <Unavailable reason={inExpoGo ? "Google sign-in works in the installed app, not Expo Go. Use email here." : "Google sign-in isn't set up for this platform yet."} />;
  }
  return <NativeGoogle webClientId={webClientId} onIdToken={onIdToken} onError={onError} />;
}

function NativeGoogle({ webClientId, onIdToken, onError }: { webClientId?: string; onIdToken: (t: string) => Promise<void>; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId, androidClientId: ANDROID_ID, iosClientId: IOS_ID,
  });
  useEffect(() => {
    if (!response) return;
    if (response.type === "success" && response.params.id_token) {
      setBusy(true);
      onIdToken(response.params.id_token).catch((e) => onError((e as Error).message)).finally(() => setBusy(false));
    } else if (response.type === "error") {
      onError(response.error?.message ?? "Google sign-in failed.");
    }
  }, [response]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Button title="Continue with Google" variant="secondary" icon={<GoogleG />} onPress={() => promptAsync()} disabled={!request} loading={busy} />;
}

function Unavailable({ reason }: { reason: string }) {
  return <T v="caption" style={{ textAlign: "center" }}>{reason}</T>;
}

/** Google "G" mark, drawn with plain views (no image asset). */
export function GoogleG() {
  return (
    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
      <T v="caption" color="#4285F4" style={{ fontWeight: "800", fontSize: 12, lineHeight: 14 }}>G</T>
    </View>
  );
}
