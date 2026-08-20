import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { User } from "../lib/types";

export function LoginPage() {
  const { verifyOtp, register } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "otp" | "register">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [regToken, setRegToken] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const sendCode = async () => {
    setError(""); setSending(true);
    try {
      await api.post("/auth/send-otp", { email });
      setStep("otp");
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
        // Check if rider needs setup
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

  return (
    <div className="page" style={{ paddingTop: 64 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>🚴 Rider Login</h1>
      <p style={{ color: "var(--gray-500)", marginBottom: 24, fontSize: 14 }}>Deliver with Ramnagar Eats</p>

      {step === "email" && (
        <>
          <div className="field">
            <label className="label">Email</label>
            <input className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendCode()} />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-block" onClick={sendCode} disabled={sending || !email}>
            {sending ? "Sending…" : "Send Code"}
          </button>
        </>
      )}

      {step === "otp" && (
        <>
          <p style={{ fontSize: 14, color: "var(--gray-500)", marginBottom: 16 }}>Code sent to <strong>{email}</strong></p>
          <div className="field">
            <label className="label">6-digit code</label>
            <input className="input" type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && verify()} autoFocus />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-block" onClick={verify} disabled={sending || code.length !== 6}>
            {sending ? "Verifying…" : "Verify"}
          </button>
          <button className="btn btn-outline btn-block" style={{ marginTop: 8 }} onClick={() => { setStep("email"); setCode(""); setError(""); }}>Back</button>
        </>
      )}

      {step === "register" && (
        <>
          <p style={{ fontSize: 14, color: "var(--gray-500)", marginBottom: 16 }}>Create your rider account</p>
          <div className="field">
            <label className="label">Name</label>
            <input className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
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

      <p style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "var(--gray-400)" }}>
        Or{" "}
        <a href={`http://localhost:5000/api/v1/auth/google?app=rider`} style={{ color: "var(--green-500)", fontWeight: 600 }}>
          Sign in with Google
        </a>
      </p>
    </div>
  );
}
