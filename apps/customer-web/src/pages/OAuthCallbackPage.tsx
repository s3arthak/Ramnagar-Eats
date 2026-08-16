import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { User } from "../lib/types";
import { Spinner } from "../components/ui/Skeleton";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { routeByRole } from "./LoginPage";

type Step = "loading" | "error" | "phone" | "done";

export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const { setSession, updateMe } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const token = searchParams.get("token");
    const rawUser = searchParams.get("user");
    const isNew = searchParams.get("isNew") === "true";
    const oauthError = searchParams.get("error");
    if (oauthError) {
      setError(oauthError);
      setStep("error");
      return;
    }
    if (!token || !rawUser) {
      setError("Google sign-in did not complete. Please try again.");
      setStep("error");
      return;
    }
    let parsed: User;
    try {
      parsed = JSON.parse(decodeURIComponent(rawUser)) as User;
    } catch {
      setError("Google sign-in did not complete. Please try again.");
      setStep("error");
      return;
    }
    setSession(token, parsed);
    // New Google users without a phone get an optional completion step.
    if (isNew && !parsed.phone) {
      setUser(parsed);
      setStep("phone");
      return;
    }
    navigate(routeByRole(parsed), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function savePhone(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await updateMe({ phone: phone.trim() || undefined });
      setStep("done");
      navigate(routeByRole(user!), { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your phone number");
    } finally {
      setSaving(false);
    }
  }

  if (step === "error") {
    return (
      <div className="content page">
        <div className="empty-state">
          <p>{error}</p>
          <Link className="filter" to="/login">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  if (step === "phone" && user) {
    return (
      <div className="content page oauth-step">
        <div className="auth-form-card">
          <p className="eyebrow">WELCOME, {user.name.split(" ")[0].toUpperCase()}</p>
          <h2>Almost done</h2>
          <p className="auth-copy">
            Signed in with <strong>{user.email}</strong>. Add a phone number so restaurants can reach you (optional).
          </p>
          <form onSubmit={(event) => void savePhone(event)} className="oauth-phone-form">
            <Input label="Phone number (optional)" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="9876543210" autoComplete="tel" inputMode="tel" />
            {error && (
              <p className="notice notice--error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" loading={saving} className="auth-submit">
              Continue
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="content page">
      <Spinner label="Completing sign-in…" />
    </div>
  );
}
