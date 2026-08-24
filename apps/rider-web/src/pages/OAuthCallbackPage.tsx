import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const token = params.get("token");
    const userJson = params.get("user");
    const oauthError = params.get("error");
    if (oauthError) {
      setError(oauthError);
      return;
    }
    if (token && userJson) {
      try {
        const raw = JSON.parse(decodeURIComponent(userJson));
        // If the user is not a RIDER (e.g. admin email signed in via rider app),
        // show an error instead of crashing with a type mismatch.
        if (raw.role !== "RIDER") {
          setError("This account is not a rider account. Please use the correct app to sign in.");
          return;
        }
        setSession(token, raw);
        if (!raw.vehicleType) navigate("/setup");
        else navigate("/");
      } catch {
        setError("Google sign-in did not complete. Please try again.");
      }
    } else {
      setError("Google sign-in did not complete. Please try again.");
    }
  }, [params, setSession, navigate]);

  if (error) {
    return (
      <div className="login-page">
        <div className="empty-state">
          <p>{error}</p>
          <a className="login-footer-link" href="/login">
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  return <div className="login-page"><div className="rider-loading">Signing you in…</div></div>;
}
