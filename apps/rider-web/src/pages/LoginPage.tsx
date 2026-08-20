import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, API_BASE } from "../lib/api";
import type { User } from "../lib/types";
import { GoogleIcon } from "../components/GoogleIcon";

export function LoginPage() {
  const { user, verifyOtp, register } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "otp" | "register">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [regToken, setRegToken] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const resendTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  useEffect(() => () => {
    if (resendTimer.current) clearInterval(resendTimer.current);
  }, []);

  function startResendCountdown(seconds: number) {
    if (resendTimer.current) clearInterval(resendTimer.current);
    setResendIn(seconds);
    resendTimer.current = setInterval(() => {
      setResendIn((current) => {
        if (current <= 1 && resendTimer.current) clearInterval(resendTimer.current);
        return Math.max(0, current - 1);
      });
    }, 1000);
  }

  const sendCode = async () => {
    setError(""); setSending(true);
    try {
      await api.post("/auth/send-otp", { email });
      setStep("otp");
      startResendCountdown(60);
      if (import.meta.env.DEV) {
        try {
          const data = await api.get<{ code: string }>(`/auth/dev-otp?email=${encodeURIComponent(email)}`);
          setDevCode(data.code);
        } catch { setDevCode(""); }
      }
    } catch (e: any) {
      setError(e.message || "Failed to send code");
    } finally { setSending(false); }
  };

  const verify = async () => {
    setError(""); setSending(true);
    try {
      const result = await verifyOtp(email, code);
      if (result.isNew && result.regToken) {
        setRegToken(result.regToken);
        setStep("register");
      } else if (result.token && result.user) {
        const u = result.user as User;
        if (!u.vehicleType) navigate("/setup");
        else navigate("/");
      }
    } catch (e: any) {
      setError(e.message || "Invalid code");
    } finally { setSending(false); }
  };

  const doRegister = async () => {
    setError(""); setSending(true);
    try {
      const user = await register({ email, regToken, name, phone: phone || undefined });
      if (!user.vehicleType) navigate("/setup");
      else navigate("/");
    } catch (e: any) {
      setError(e.message || "Registration failed");
    } finally { setSending(false); }
  };

  function startGoogle() {
    window.location.href = `${API_BASE}/auth/google?app=rider`;
  }

  function backToEmail() {
    setStep("email");
    setCode("");
    setError("");
    setDevCode("");
  }

  return (
    <div className="login-page">
      <h1 className="login-title">🚴 Rider Login</h1>
      <p className="login-subtitle">Deliver with Ramnagar Eats</p>

      <button className="login-google-btn" onClick={startGoogle}>
        <GoogleIcon /> Continue with Google
      </button>

      <div className="login-divider">— or use email —</div>

      {step === "email" && (
        <>
          <div className="field">
            <label className="label">Email</label>
            <input className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendCode()} autoFocus />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-block" onClick={sendCode} disabled={sending || !email}>
            {sending ? "Sending…" : "Send Code"}
          </button>
        </>
      )}

      {step === "otp" && (
        <>
          <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16 }}>
            Code sent to <strong>{email}</strong> — <button type="button" onClick={backToEmail} style={{ color: "var(--green-500)", fontWeight: 700, border: "none", background: "none", cursor: "pointer", font: "inherit" }}>change</button>
          </p>
          <div className="field">
            <label className="label">6-digit code</label>
            <input className="input" type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={(e) => e.key === "Enter" && verify()} autoFocus />
          </div>
          {devCode && import.meta.env.DEV && (
            <div className="dev-otp-hint">Dev code: <strong>{devCode}</strong></div>
          )}
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-block" onClick={verify} disabled={sending || code.length !== 6}>
            {sending ? "Verifying…" : "Verify"}
          </button>
          <p style={{ textAlign: "center", marginTop: 12, fontSize: 13, color: "var(--muted)" }}>
            {resendIn > 0 ? (
              <>Resend code in {resendIn}s</>
            ) : (
              <>Didn&apos;t get it?{" "}<button type="button" onClick={sendCode} style={{ color: "var(--green-500)", fontWeight: 700, border: "none", background: "none", cursor: "pointer", font: "inherit" }}>Resend code</button></>
            )}
          </p>
          <button className="btn btn-outline btn-block" style={{ marginTop: 8 }} onClick={backToEmail}>Back</button>
        </>
      )}

      {step === "register" && (
        <>
          <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16 }}>Create your rider account</p>
          <div className="field">
            <label className="label">Name</label>
            <input className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label className="label">Phone (optional)</label>
            <input className="input" type="tel" placeholder="9876543210" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-block" onClick={doRegister} disabled={sending || name.length < 2}>
            {sending ? "Creating…" : "Create Account"}
          </button>
        </>
      )}

      <div className="login-footer">
        {step !== "email" ? (
          <button type="button" onClick={() => setStep("email")} className="login-footer-link">Back to options</button>
        ) : (
          <span>Riding for Ramnagar Eats 🍛</span>
        )}
      </div>
    </div>
  );
}
