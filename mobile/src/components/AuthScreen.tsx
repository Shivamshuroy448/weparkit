import { CheckCircle2, Eye, EyeOff, Lock, Mail, ShieldCheck, X } from "lucide-react-native";
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
import { Banner, Button, Card, DemoTag, Input, T, row } from "./ui";

type Mode = "login" | "signup";
const ALLOWED_EMAIL = /^[a-z0-9][a-z0-9._%+-]{0,63}@(buffalo\.edu|gmail\.com)$/i;

const UB_PRESETS = [
  { label: "svelamak", desc: "Shivamshu Roy" },
  { label: "sroy", desc: "Commuter" },
  { label: "victor_bull", desc: "Student" },
  { label: "capen_scholar", desc: "Resident" },
];

/** Email + password or native UB Single Sign-On (UBIT / Shibboleth). */
export default function AuthScreen() {
  const { c } = useStore();
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({});

  // UB Single Sign-On state
  const [ubModal, setUbModal] = useState(false);
  const [ubitName, setUbitName] = useState("");
  const [ubitPassword, setUbitPassword] = useState("");
  const [ubShowPass, setUbShowPass] = useState(false);
  const [ubBusy, setUbBusy] = useState(false);
  const [ubError, setUbError] = useState<string | null>(null);

  // verification step
  const [verifyFor, setVerifyFor] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  // Google sign-in
  const [googleId, setGoogleId] = useState<string | null>(null);
  useEffect(() => {
    authApi.providers().then((p) => setGoogleId(p.google ? (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || p.google_client_ids[0]) : null)).catch(() => {});
  }, []);
  const google = async (idToken: string) => { setError(null); await auth.googleSignIn(idToken); };

  const validate = () => {
    const e = email.trim().toLowerCase();
    const errs: typeof fieldErr = {};
    if (!ALLOWED_EMAIL.test(e)) errs.email = "Use a @buffalo.edu or @gmail.com email.";
    if (password.length < 8) errs.password = "At least 8 characters.";
    setFieldErr(errs);
    return Object.keys(errs).length ? null : e;
  };

  const toVerify = (addr: string, sent: { email_sent: boolean; dev_code?: string }) => {
    setVerifyFor(addr); setCode(""); setDevCode(sent.dev_code ?? null); setEmailSent(sent.email_sent); setError(null);
  };

  const submit = async () => {
    const e = validate();
    if (!e) return;
    setBusy(true); setError(null);
    try {
      const r = mode === "signup" ? await auth.signup(e, password) : await auth.login(e, password);
      if (r.verify) toVerify(e, r.verify);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
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

  const confirm = async (value = code) => {
    if (!verifyFor || value.trim().length < 6) return setError("Enter the 6-digit code.");
    setBusy(true); setError(null);
    try { await auth.verify(verifyFor, value.trim()); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  const resend = async () => {
    if (!verifyFor) return;
    try { const r = await auth.resend(verifyFor); setDevCode(r.dev_code ?? devCode); setEmailSent(r.email_sent); setError(null); }
    catch (err) { setError((err as Error).message); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <Starfield />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: space.xl, gap: space.xl }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: "center", gap: space.sm }}>
            <Logo size={56} />
            <T v="title" style={{ fontSize: 34 }}>WeParkit</T>
            <T v="body" color={c.textMuted} style={{ textAlign: "center" }}>UB parking at North Campus</T>
          </View>

          {ubModal ? (
            /* ==================== UB CENTRAL AUTHENTICATION SERVICE (CAS / SHIBBOLETH) ==================== */
            <Card style={{ gap: space.lg, borderColor: "#005BBB", borderWidth: 1.5, overflow: "hidden" }}>
              {/* UB Header Banner */}
              <View style={{ backgroundColor: "#005BBB", marginHorizontal: -16, marginTop: -16, padding: space.lg, gap: 4 }}>
                <View style={[row.between, { alignItems: "center" }]}>
                  <View style={[row.gap, { alignItems: "center", gap: space.sm }]}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "#005BBB", fontWeight: "900", fontSize: 15 }}>UB</Text>
                    </View>
                    <View>
                      <T v="subheading" color="#FFFFFF" style={{ fontSize: 15, fontWeight: "800" }}>University at Buffalo</T>
                      <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>The State University of New York</Text>
                    </View>
                  </View>
                  <Pressable onPress={() => { setUbModal(false); setUbError(null); }} hitSlop={10}>
                    <X size={20} color="#FFFFFF" />
                  </Pressable>
                </View>
                <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.2)", marginVertical: 4 }} />
                <View style={[row.between, { alignItems: "center" }]}>
                  <T v="label" color="#FFFFFF" style={{ fontSize: 12 }}>UBIT Central Authentication Service</T>
                  <View style={{ backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ color: "#FFFFFF", fontSize: 9.5, fontWeight: "700" }}>SAML 2.0 / CAS</Text>
                  </View>
                </View>
              </View>

              <View style={{ gap: 2 }}>
                <T v="subheading">Sign in with your UBITName</T>
                <T v="caption" color={c.textMuted}>Enter your campus credentials to access UB North parking.</T>
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
              <View style={{ backgroundColor: "rgba(0, 91, 187, 0.12)", borderColor: "rgba(0, 91, 187, 0.3)", borderWidth: 1, borderRadius: 8, padding: space.sm, gap: 4 }}>
                <View style={[row.gap, { alignItems: "center" }]}>
                  <CheckCircle2 size={16} color="#005BBB" />
                  <T v="label" style={{ color: "#005BBB", fontSize: 11.5, fontWeight: "700" }}>Duo Two-Factor Authentication</T>
                </View>
                <T v="caption" color={c.textMuted} style={{ fontSize: 10.5 }}>
                  Duo Mobile push will be verified automatically for registered campus devices.
                </T>
              </View>

              {/* Quick Preset Buttons for Instant Demo Testing */}
              <View style={{ gap: 6 }}>
                <T v="caption" color={c.textFaint} style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Quick Student Presets (Tap to fill):</T>
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
                        backgroundColor: c.surfaceAlt,
                        borderColor: ubitName === p.label ? "#005BBB" : c.border,
                        borderWidth: 1,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 6,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Text style={{ color: ubitName === p.label ? "#005BBB" : c.text, fontSize: 11, fontWeight: "600" }}>{p.label}</Text>
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
                  backgroundColor: "#005BBB",
                  paddingVertical: 14,
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 8,
                  opacity: ubBusy ? 0.7 : 1,
                }}
              >
                <Lock size={16} color="#FFFFFF" />
                <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 14 }}>
                  {ubBusy ? "Authenticating with UB CAS..." : "Log In to UB Services"}
                </Text>
              </Pressable>

              {/* Disclaimer & Policy Notice */}
              <Text style={{ color: c.textFaint, fontSize: 10, textAlign: "center", lineHeight: 14 }}>
                By logging in with your UBITName, you agree to the University at Buffalo Policy on Responsible Use of Information Technology Resources.
              </Text>

              <Pressable onPress={() => { setUbModal(false); setUbError(null); }} hitSlop={8} style={{ alignItems: "center" }}>
                <T v="label" color={c.textMuted}>← Back to standard login</T>
              </Pressable>
            </Card>
          ) : verifyFor ? (
            /* ==================== CODE VERIFICATION VIEW ==================== */
            <Card style={{ gap: space.lg }}>
              <View style={[row.gap, { gap: space.md }]}>
                <Mail size={22} color={c.accent} />
                <View style={{ flex: 1 }}>
                  <T v="subheading">Check your email</T>
                  <T v="caption">{emailSent ? `We sent a 6-digit code to ${verifyFor}.` : `Enter the 6-digit code for ${verifyFor}.`}</T>
                </View>
              </View>
              {devCode && (
                <Banner tone="warn" title={<View style={row.gap}><DemoTag /><T v="subheading" color={c.warn}>Email isn't set up on this server</T></View>}
                  right={<Button size="sm" variant="secondary" title="Use it" onPress={() => { setCode(devCode); confirm(devCode); }} />}>
                  {`Demo mode shows the code here instead: ${devCode}`}
                </Banner>
              )}
              <Input label="Verification code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456" keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code"
                maxLength={6} onSubmitEditing={() => confirm()} />
              {error && <Banner tone="danger">{error}</Banner>}
              <Button title="Verify and continue" onPress={() => confirm()} loading={busy} />
              <View style={row.between}>
                <Pressable onPress={() => { setVerifyFor(null); setError(null); }} hitSlop={8}><T v="label" color={c.accent}>Back</T></Pressable>
                <Pressable onPress={resend} hitSlop={8}><T v="label" color={c.accent}>Send a new code</T></Pressable>
              </View>
            </Card>
          ) : (
            /* ==================== STANDARD AUTH SCREEN WITH UB SSO PROMINENT BUTTON ==================== */
            <Card style={{ gap: space.lg }}>
              <T v="heading">{mode === "signup" ? "Create your account" : "Log in"}</T>

              {/* Prominent UB Single Sign-On Button */}
              <Pressable
                onPress={() => setUbModal(true)}
                style={{
                  backgroundColor: "#005BBB",
                  borderRadius: 10,
                  paddingVertical: 13,
                  paddingHorizontal: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  borderWidth: 1,
                  borderColor: "#3385ff",
                  shadowColor: "#005BBB",
                  shadowOpacity: 0.35,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 3,
                }}
              >
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#005BBB", fontWeight: "900", fontSize: 13 }}>UB</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <T v="label" color="#FFFFFF" style={{ fontWeight: "700", fontSize: 14 }}>
                    Log in with UB Single Sign-On
                  </T>
                  <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 10.5 }}>
                    UBIT Central Authentication (SAML 2.0 / CAS)
                  </Text>
                </View>
                <ShieldCheck size={18} color="#FFFFFF" />
              </Pressable>

              {/* Divider */}
              <View style={[row.gap, { gap: space.md, marginVertical: 2 }]}>
                <View style={{ flex: 1, height: 1, backgroundColor: c.divider }} />
                <T v="caption" color={c.textFaint}>or continue with email</T>
                <View style={{ flex: 1, height: 1, backgroundColor: c.divider }} />
              </View>

              <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@buffalo.edu or you@gmail.com" keyboardType="email-address"
                autoComplete="email" textContentType="emailAddress" error={fieldErr.email} maxLength={120} />
              <Input label="Password" value={password} onChangeText={setPassword} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                secure={!show} autoComplete={mode === "signup" ? "new-password" : "current-password"}
                textContentType={mode === "signup" ? "newPassword" : "password"} error={fieldErr.password} maxLength={128} onSubmitEditing={submit}
                right={<Pressable onPress={() => setShow((s) => !s)} hitSlop={10} accessibilityLabel={show ? "Hide password" : "Show password"}>
                  {show ? <EyeOff size={18} color={c.textMuted} /> : <Eye size={18} color={c.textMuted} />}
                </Pressable>} />
              {error && <Banner tone="danger">{error}</Banner>}
              <Button title={mode === "signup" ? "Create account" : "Log in"} onPress={submit} loading={busy} />
              {googleId && (
                <>
                  <View style={[row.gap, { gap: space.md }]}>
                    <View style={{ flex: 1, height: 1, backgroundColor: c.divider }} /><T v="caption">or</T><View style={{ flex: 1, height: 1, backgroundColor: c.divider }} />
                  </View>
                  <GoogleButton webClientId={googleId} onIdToken={google} onError={setError} />
                </>
              )}
              <Pressable onPress={() => { setMode(mode === "signup" ? "login" : "signup"); setError(null); setFieldErr({}); }} hitSlop={8}
                style={{ alignItems: "center" }} accessibilityRole="button">
                <T v="label" color={c.accent}>{mode === "signup" ? "Already have an account? Log in" : "New here? Create an account"}</T>
              </Pressable>
              <View style={{ height: 1, backgroundColor: c.divider, marginVertical: space.xs }} />
              <Pressable onPress={auth.continueAsGuest} hitSlop={8} style={{ alignItems: "center" }} accessibilityRole="button">
                <T v="label" color={c.textMuted}>Browse campus parking as guest →</T>
              </Pressable>
            </Card>
          )}

          <View style={{ alignItems: "center", opacity: 0.85 }}><Alien size={40} /></View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
