import { CheckCircle2, Eye, EyeOff, Lock, ShieldCheck } from "lucide-react-native";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authApi } from "../api";
import { useAuth } from "../auth";
import GoogleButton from "./GoogleButton";
import { useStore } from "../store";
import { space } from "../theme";
import Logo from "./Logo";
import { Alien } from "./SpaceArt";
import Starfield from "./Starfield";
import { Banner, Card, Input, T, row } from "./ui";

const UB_PRESETS = [
  { label: "sroy", desc: "Commuter" },
  { label: "victor_bull", desc: "Student" },
  { label: "capen_scholar", desc: "Resident" },
];

/** University at Buffalo Central Authentication Service (UBIT / Shibboleth CAS). */
export default function AuthScreen() {
  const { c } = useStore();
  const auth = useAuth();

  // UB Single Sign-On state
  const [ubitName, setUbitName] = useState("");
  const [ubitPassword, setUbitPassword] = useState("");
  const [ubShowPass, setUbShowPass] = useState(false);
  const [ubBusy, setUbBusy] = useState(false);
  const [ubError, setUbError] = useState<string | null>(null);

  // Google sign-in
  const [googleId, setGoogleId] = useState<string | null>(null);
  useEffect(() => {
    authApi
      .providers()
      .then((p) =>
        setGoogleId(
          p.google ? (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || p.google_client_ids[0]) : null
        )
      )
      .catch(() => {});
  }, []);
  const google = async (idToken: string) => {
    setUbError(null);
    await auth.googleSignIn(idToken);
  };

  const submitUbSso = async (overrideUbit?: string) => {
    const target = (overrideUbit ?? ubitName).trim();
    if (!target || target.length < 2) {
      setUbError("Enter a valid UBITName (e.g. sroy, victor_bull, or yourname@buffalo.edu).");
      return;
    }
    if (!ubitPassword || ubitPassword.length < 6) {
      setUbError("Enter your UBIT password (minimum 6 characters).");
      return;
    }
    setUbBusy(true);
    setUbError(null);
    try {
      await auth.ubSignIn(target, ubitPassword);
    } catch (err) {
      setUbError((err as Error).message);
    } finally {
      setUbBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <Starfield />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: space.xl, gap: space.xl }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: "center", gap: space.sm }}>
            <Logo size={56} />
            <T v="title" style={{ fontSize: 34 }}>
              WeParkit
            </T>
            <T v="body" color={c.textMuted} style={{ textAlign: "center" }}>
              UB parking at North Campus
            </T>
          </View>

          {/* ==================== UB CENTRAL AUTHENTICATION SERVICE ==================== */}
          <Card style={{ gap: space.lg, borderColor: "rgba(34, 197, 94, 0.4)", borderWidth: 1.5, overflow: "hidden" }}>
            {/* UB Header Banner */}
            <View style={{ backgroundColor: "#14532D", marginHorizontal: -16, marginTop: -16, padding: space.lg, gap: 4 }}>
              <View style={[row.between, { alignItems: "center" }]}>
                <View style={[row.gap, { alignItems: "center", gap: space.sm }]}>
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      backgroundColor: "#22C55E",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: "#021208", fontWeight: "900", fontSize: 15 }}>UB</Text>
                  </View>
                  <View>
                    <T v="subheading" color="#FFFFFF" style={{ fontSize: 15, fontWeight: "800" }}>
                      University at Buffalo
                    </T>
                    <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      The State University of New York
                    </Text>
                  </View>
                </View>
                <ShieldCheck size={20} color="#22C55E" />
              </View>
              <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.15)", marginVertical: 4 }} />
              <View style={[row.between, { alignItems: "center" }]}>
                <T v="label" color="#FFFFFF" style={{ fontSize: 12 }}>
                  UBIT Central Authentication Service
                </T>
                <View style={{ backgroundColor: "rgba(34, 197, 94, 0.25)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ color: "#22C55E", fontSize: 9.5, fontWeight: "700" }}>SAML 2.0 / CAS</Text>
                </View>
              </View>
            </View>

            <View style={{ gap: 2 }}>
              <T v="subheading">Sign in with your UBITName</T>
              <T v="caption" color={c.textMuted}>
                Enter your campus credentials to access UB North parking.
              </T>
            </View>

            {/* UBIT Name Input */}
            <Input
              label="UBITName"
              value={ubitName}
              onChangeText={setUbitName}
              placeholder="e.g. sroy or yourname@buffalo.edu"
              maxLength={60}
            />

            {/* UBIT Password Input */}
            <Input
              label="UBIT Password"
              value={ubitPassword}
              onChangeText={setUbitPassword}
              placeholder="Your UBIT password"
              secure={!ubShowPass}
              maxLength={128}
              onSubmitEditing={() => submitUbSso()}
              right={
                <Pressable onPress={() => setUbShowPass((s) => !s)} hitSlop={10}>
                  {ubShowPass ? <EyeOff size={18} color={c.textMuted} /> : <Eye size={18} color={c.textMuted} />}
                </Pressable>
              }
            />

            {/* Duo Security Indicator */}
            <View
              style={{
                backgroundColor: "rgba(34, 197, 94, 0.10)",
                borderColor: "rgba(34, 197, 94, 0.3)",
                borderWidth: 1,
                borderRadius: 8,
                padding: space.sm,
                gap: 4,
              }}
            >
              <View style={[row.gap, { alignItems: "center" }]}>
                <CheckCircle2 size={16} color="#22C55E" />
                <T v="label" style={{ color: "#22C55E", fontSize: 11.5, fontWeight: "700" }}>
                  Duo Two-Factor Authentication
                </T>
              </View>
              <T v="caption" color={c.textMuted} style={{ fontSize: 10.5 }}>
                Duo Mobile push will be verified automatically for registered campus devices.
              </T>
            </View>

            {/* Quick Preset Buttons for Instant Demo Testing */}
            <View style={{ gap: 6 }}>
              <T v="caption" color={c.textFaint} style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Quick Student Presets (Tap to fill):
              </T>
              <View style={[row.gap, { flexWrap: "wrap", gap: space.xs }]}>
                {UB_PRESETS.map((p) => (
                  <Pressable
                    key={p.label}
                    onPress={() => {
                      setUbitName(p.label);
                      setUbitPassword("password123");
                      setUbError(null);
                    }}
                    style={{
                      backgroundColor: ubitName === p.label ? "rgba(34, 197, 94, 0.18)" : c.surfaceAlt,
                      borderColor: ubitName === p.label ? "#22C55E" : c.border,
                      borderWidth: 1,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Text style={{ color: ubitName === p.label ? "#22C55E" : c.text, fontSize: 11, fontWeight: "600" }}>
                      {p.label}
                    </Text>
                    <Text style={{ color: c.textFaint, fontSize: 9.5 }}>({p.desc})</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {ubError && <Banner tone="danger">{ubError}</Banner>}

            {/* Submit UB Login Button */}
            <Pressable
              onPress={() => submitUbSso()}
              disabled={ubBusy}
              style={{
                backgroundColor: "#22C55E",
                paddingVertical: 14,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
                shadowColor: "#22C55E",
                shadowOpacity: 0.35,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 },
                elevation: 4,
                opacity: ubBusy ? 0.7 : 1,
              }}
            >
              <Lock size={16} color="#021208" />
              <Text style={{ color: "#021208", fontWeight: "800", fontSize: 14 }}>
                {ubBusy ? "Authenticating with UB CAS..." : "Log In to UB Services"}
              </Text>
            </Pressable>

            {/* Disclaimer & Policy Notice */}
            <Text style={{ color: c.textFaint, fontSize: 10, textAlign: "center", lineHeight: 14 }}>
              By logging in with your UBITName, you agree to the University at Buffalo Policy on Responsible Use of Information Technology Resources.
            </Text>

            {googleId && (
              <>
                <View style={[row.gap, { gap: space.md, marginVertical: 4 }]}>
                  <View style={{ flex: 1, height: 1, backgroundColor: c.divider }} />
                  <T v="caption">or</T>
                  <View style={{ flex: 1, height: 1, backgroundColor: c.divider }} />
                </View>
                <GoogleButton webClientId={googleId} onIdToken={google} onError={setUbError} />
              </>
            )}

            <View style={{ height: 1, backgroundColor: c.divider, marginVertical: space.xs }} />

            <Pressable onPress={auth.continueAsGuest} hitSlop={8} style={{ alignItems: "center" }} accessibilityRole="button">
              <T v="label" color={c.accent}>
                Browse campus parking as guest →
              </T>
            </Pressable>
          </Card>

          <View style={{ alignItems: "center", opacity: 0.85 }}>
            <Alien size={40} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
