import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Mail } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api, API_BASE } from "../lib/api";
import type { User } from "../lib/types";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { GoogleIcon } from "../components/GoogleIcon";

type Stage = "choose" | "email" | "code" | "details";

export function LoginPage() {
  const { user, verifyOtp, register } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  // Already signed in? Send them where they were headed instead of showing the form.
  useEffect(() => {
    if (user) navigate(from, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const [stage, setStage] = useState<Stage>("choose");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [regToken, setRegToken] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
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

  async function sendOtp(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
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
      setError(caught instanceof Error ? caught.message : "Could not send the code");
    } finally {
      setSubmitting(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await verifyOtp(email.trim(), code.trim());
      if (data.isNew && data.regToken) {
        setRegToken(data.regToken);
        setStage("details");
      } else if (data.token && data.user) {
        push("Signed in", { tone: "success" });
        navigate(from, { replace: true });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not verify the code");
    } finally {
      setSubmitting(false);
    }
  }

  async function completeRegistration(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await register({ email: email.trim(), regToken, name: name.trim(), phone: phone.trim() || undefined });
      push("Account created — welcome!", { tone: "success" });
      navigate(from, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create your account");
    } finally {
      setSubmitting(false);
    }
  }

  function startGoogle() {
    window.location.href = `${API_BASE}/auth/google?app=customer`;
  }

  function backToChoose() {
    setStage("choose");
    setCode("");
    setRegToken("");
    setDevCode("");
    setError("");
  }

  return (
    <div className="auth-page">
      <section className="auth-panel">
        <div className="auth-floaties" aria-hidden="true">
          <span className="floaty f1">🍜</span>
          <span className="floaty f2">🍕</span>
          <span className="floaty f3">🍛</span>
          <span className="floaty f4">🥟</span>
          <span className="floaty f5">🛵</span>
          <span className="floaty f6">🍢</span>
        </div>
        <div className="auth-panel-inner">
          <Link className="brand brand--light" to="/" aria-label="Ramnagar Eats home">
            <span className="brand-mark" aria-hidden="true">🍛</span>
            <span className="brand-name">RAMNAGAR <b>EATS</b></span>
          </Link>
          <p className="eyebrow">WELCOME TO RAMNAGAR EATS</p>
          <h1>
            Great food,
            <br />
            <i>brought to your door.</i>
          </h1>
          <p>Browse the best kitchens near you, order in a few taps, and follow every step live — from stove to doorstep.</p>
          <ul className="auth-perks">
            <li><span className="perk-icon">✦</span> One sign-in for email &amp; Google</li>
            <li><span className="perk-icon">★</span> Live tracking from kitchen to door</li>
            <li><span className="perk-icon">✦</span> Saved addresses, one-tap checkout</li>
          </ul>
        </div>
      </section>
      <section className="auth-form">
        {stage === "choose" && (
          <div className="auth-form-card">
            <p className="eyebrow auth-eyebrow">WELCOME</p>
            <h2 className="auth-title">Sign in to start ordering</h2>
            <p className="auth-copy">Use your email or Google account — your order history and saved addresses will be waiting.</p>
            <div className="oauth-options">
              <Button type="button" className="oauth-option oauth-option--email" onClick={() => setStage("email")}>
                <Mail size={18} /> Continue with Email
              </Button>
              <Button type="button" variant="secondary" className="oauth-option oauth-option--google" onClick={startGoogle}>
                <GoogleIcon /> Continue with Google
              </Button>
            </div>
            <p className="auth-switch">
              New here?{" "}
              <button type="button" onClick={() => setStage("email")}>
                Create an account
              </button>{" "}
              — same flow, one code.
            </p>
          </div>
        )}

        {stage === "email" && (
          <form onSubmit={sendOtp} className="auth-form-card" aria-label="Send email OTP">
            <p className="eyebrow">ONE-TIME CODE BY EMAIL</p>
            <h2>Continue with Email</h2>
            <p className="auth-copy">Enter your email and we&apos;ll send you a 6-digit code.</p>
            <Input label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required />
            {error && (
              <p className="notice notice--error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" loading={submitting} className="auth-submit">
              <Mail size={16} /> Send code
            </Button>
            <p className="auth-switch">
              <button type="button" className="link-button" onClick={backToChoose}>
                Back
              </button>
            </p>
          </form>
        )}

        {stage === "code" && (
          <form onSubmit={verify} className="auth-form-card" aria-label="Verify email OTP">
            <p className="eyebrow">ENTER THE CODE</p>
            <h2>Verify your email</h2>
            <p className="auth-copy">
              We emailed a 6-digit code to <strong>{email}</strong>.{" "}
              <button type="button" className="link-button" onClick={() => setStage("email")}>
                Change email
              </button>
            </p>
            <label className="otp-field">
              <span>6-digit code</span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="······"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </label>
            {devCode && import.meta.env.DEV && (
              <p className="notice notice--info dev-otp-hint" role="status">
                Development code: <b>{devCode}</b> — not shown in production.
              </p>
            )}
            {error && (
              <p className="notice notice--error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" loading={submitting} className="auth-submit" disabled={code.length !== 6}>
              Verify &amp; continue
            </Button>
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
          <form onSubmit={completeRegistration} className="auth-form-card" aria-label="Complete registration">
            <p className="eyebrow">ALMOST THERE</p>
            <h2>Tell us who you are</h2>
            <p className="auth-copy">
              Your email <strong>{email}</strong> is verified. Add your details to finish.
            </p>
            <Input label="Your name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Priya Sharma" autoComplete="name" required />
            <Input label="Phone number (optional)" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+919876543210" autoComplete="tel" inputMode="tel" />
            {error && (
              <p className="notice notice--error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" loading={submitting} className="auth-submit" disabled={name.trim().length < 2}>
              Create account
            </Button>
            <p className="auth-switch">
              <button type="button" className="link-button" onClick={backToChoose}>
                Use a different email
              </button>
            </p>
          </form>
        )}
      </section>
    </div>
  );
}

export function routeByRole(user: User) {
  if (user.role === "ADMIN") return "/admin";
  if (user.role === "RESTAURANT") return "/dashboard";
  return "/";
}
