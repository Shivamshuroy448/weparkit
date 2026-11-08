// Web "Continue with Google": Google Identity Services renders its own button and returns an ID token
// (credential) that the backend verifies with Google. Requires the web OAuth client ID to list this page's
// origin (e.g. http://localhost:8081) under "Authorized JavaScript origins".
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { View } from "react-native";
import { T } from "./ui";

const GSI_SRC = "https://accounts.google.com/gsi/client";

type GoogleId = {
  accounts: { id: {
    initialize: (o: { client_id: string; callback: (r: { credential?: string }) => void; ux_mode?: string }) => void;
    renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
  } };
};

let scriptPromise: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if ((window as unknown as { google?: GoogleId }).google?.accounts?.id) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GSI_SRC; s.async = true; s.defer = true;
    s.onload = () => resolve(); s.onerror = () => { scriptPromise = null; reject(new Error("Couldn't load Google sign-in.")); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export default function GoogleButton({ webClientId, onIdToken, onError }: {
  webClientId?: string; onIdToken: (token: string) => Promise<void>; onError: (msg: string) => void;
}) {
  const box = useRef<ComponentRef<typeof View>>(null);  // on web this is the DOM element
  const [failed, setFailed] = useState<string | null>(null);
  const cb = useRef({ onIdToken, onError });
  cb.current = { onIdToken, onError };

  useEffect(() => {
    if (!webClientId) return;
    let cancelled = false;
    loadGsi().then(() => {
      const el = box.current as unknown as HTMLElement | null;
      const g = (window as unknown as { google?: GoogleId }).google;
      if (cancelled || !el || !g) return;
      g.accounts.id.initialize({
        client_id: webClientId,
        callback: (r) => {
          if (r.credential) cb.current.onIdToken(r.credential).catch((e) => cb.current.onError((e as Error).message));
          else cb.current.onError("Google sign-in was cancelled.");
        },
      });
      g.accounts.id.renderButton(el, { theme: "filled_black", size: "large", shape: "pill", text: "continue_with", width: 320 });
    }).catch((e) => !cancelled && setFailed((e as Error).message));
    return () => { cancelled = true; };
  }, [webClientId]);

  if (!webClientId) return <T v="caption" style={{ textAlign: "center" }}>Google sign-in isn't set up on this server.</T>;
  if (failed) return <T v="caption" style={{ textAlign: "center" }}>{failed}</T>;
  return <View ref={box} style={{ alignItems: "center", minHeight: 44 }} />;
}
