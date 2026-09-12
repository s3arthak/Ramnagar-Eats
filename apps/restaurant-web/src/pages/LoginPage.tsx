import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Mail } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api, API_BASE } from "../lib/api";
import { GoogleIcon } from "../components/GoogleIcon";

const ADMIN_EMAIL = "ramnagareats@admin.com";

type Stage = "choose" | "email" | "code" | "details";

export function LoginPage() {
  const { user, verifyOtp, register, setSession } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (user) {
      if (user.role === "ADMIN") navigate("/admin", { replace: true });
      else if (user.role === "RESTAURANT") navigate("/dashboard", { replace: true });
    }
  }, [user, navigate]);

  const [stage, setStage] = useState<Stage>("choose");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [regToken, setRegToken] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [devCode, setDevCode] = useState("");
  const resendTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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

  function land(userRole: string) {
    if (userRole === "ADMIN") navigate("/admin");
    else if (userRole === "RESTAURANT") navigate("/dashboard");
    else setMessage("This account is not a restaurant account. Sign in on the customer app instead.");
  }

  async function sendOtp(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    try {
      // Admin email: skip OTP entirely — go straight to admin dashboard.
      // If the admin-login endpoint is unavailable (e.g. production), fall through to normal OTP.
      if (email.trim().toLowerCase() === ADMIN_EMAIL) {
        try {
          const data = await api.post<{ token: string; user: { id: string; name: string; email: string; role: string } }>('/auth/admin-login', { email: email.trim() });
          setSession(data.token, data.user as any);
          push("Signed in as admin", { tone: "success" });
          land(data.user.role);
          return;
        } catch {
          // Endpoint not available — fall through to normal OTP flow
        }
      }
      await api.post("/auth/send-otp", { email: email.trim() });
      setStage("code");
      setCode("");
      startResendCountdown(60);
      push("Code sent", { body: `We emailed a 6-digit code to ${email.trim()}`, tone: "info" });
      // Local development only: surface the generated code so a human can sign in
      // without a real email gateway. The dev-otp endpoint is compiled out in production.
      if (import.meta.env.DEV) {
        try {
          const data = await api.get<{ code: string }>(`/auth/dev-otp?email=${encodeURIComponent(email.trim())}`);
          setDevCode(data.code);
        } catch {
          setDevCode("");
        }
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not send the code");
    } finally {
      setSubmitting(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    try {
      // verifyOtp sends role: RESTAURANT so only restaurant accounts match.
      // If no restaurant account exists, isNew: true triggers registration.
      const data = await verifyOtp(email.trim(), code.trim());
      if (data.isNew && data.regToken) {
        setRegToken(data.regToken);
        setStage("details");
      } else if (data.user) {
        land(data.user.role);
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not verify the code");
    } finally {
      setSubmitting(false);
    }
  }

  async function completeRegistration(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    try {
      const user = await register({ email: email.trim(), regToken, name: name.trim(), phone: phone.trim() || undefined });
      push("Restaurant account created", { tone: "success" });
      land(user.role);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not create the account");
    } finally {
      setSubmitting(false);
    }
  }

  function startGoogle() {
    window.location.href = `${API_BASE}/auth/google?app=restaurant`;
  }

  function backToChoose() {
    setStage("choose");
    setCode("");
    setRegToken("");
    setDevCode("");
    setMessage("");
  }

  return (
    <div className="login-page">
      <section className="login-panel">
        <a className="brand" href="/" aria-label="Ramnagar Eats home">
          <img className="brand-lockup" src="/logo.png" alt="Ramnagar Eats logo" width="108" height="108" />
        </a>
        <p className="eyebrow">RESTAURANT PARTNER</p>
        <h1>
          Run your service
          <br />
          with clarity.
        </h1>
        <p>Manage your menu, accept orders, and keep your kitchen moving from one focused workspace.</p>
      </section>
      <section className="login-form">
        <div>
          <p className="eyebrow">EMAIL OR GOOGLE SIGN-IN</p>
          <h2>{stage === "choose" ? "Sign in to your restaurant" : stage === "details" ? "Finish setting up" : stage === "code" ? "Verify your email" : "Continue with email"}</h2>

          {stage === "choose" && (
            <div className="auth-form-inner">
              <div className="oauth-options">
                <button className="oauth-option oauth-option--email" onClick={() => setStage("email")}>
                  <Mail size={18} /> Continue with Email
                </button>
                <button className="oauth-option oauth-option--google" onClick={startGoogle}>
                  <GoogleIcon /> Continue with Google
                </button>
              </div>
              <p className="auth-switch">
                New restaurant?{" "}
                <button type="button" onClick={() => setStage("email")}>
                  Join the platform
                </button>{" "}
                — same flow.
              </p>
            </div>
          )}

          {stage === "email" && (
            <form onSubmit={sendOtp} className="auth-form-inner">
              <label>
                Email
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" />
              </label>
              {message && <p className="notice">{message}</p>}
              <button className="submit" disabled={submitting}>
                {submitting ? "Please wait…" : "Send code"}
              </button>
              <p className="auth-switch">
                <button type="button" className="link-button" onClick={backToChoose}>
                  Back
                </button>
              </p>
            </form>
          )}

          {stage === "code" && (
            <form onSubmit={verify} className="auth-form-inner">
              <p className="notice notice--info">
                We emailed a 6-digit code to <strong>{email}</strong>.{" "}
                <button type="button" className="link-button" onClick={() => setStage("email")}>
                  Change email
                </button>
              </p>
              <label>
                6-digit code
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="······"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </label>
              {devCode && import.meta.env.DEV && (
                <p className="notice notice--info dev-otp-hint" role="status">
                  Development code: <b>{devCode}</b> — not shown in production.
                </p>
              )}
              {message && <p className="notice">{message}</p>}
              <button className="submit" disabled={submitting || code.length !== 6}>
                {submitting ? "Please wait…" : "Verify & continue"}
              </button>
              <p className="auth-switch">
                {resendIn > 0 ? (
                  <>Resend code in {resendIn}s</>
                ) : (
                  <>
                    Didn&apos;t get it?{" "}
                    <button type="button" onClick={(event) => void sendOtp(event as unknown as FormEvent)}>
                      Resend code
                    </button>
                  </>
                )}
              </p>
            </form>
          )}

          {stage === "details" && (
            <form onSubmit={completeRegistration} className="auth-form-inner">
              <p className="notice notice--info">
                <strong>{email}</strong> is verified. New restaurant? Add your details — or use an existing restaurant account&apos;s email to sign in.
              </p>
              <label>
                Restaurant / owner name
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Biryani Blues" />
              </label>
              <label>
                Phone (optional)
                <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+919876543210" inputMode="tel" />
              </label>
              {message && <p className="notice">{message}</p>}
              <button className="submit" disabled={submitting || name.trim().length < 2}>
                {submitting ? "Please wait…" : "Create account"}
              </button>
              <p className="auth-switch">
                <button type="button" className="link-button" onClick={backToChoose}>
                  Use a different email
                </button>
              </p>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
