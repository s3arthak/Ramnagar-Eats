import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { User } from "../lib/types";

export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    const rawUser = searchParams.get("user");
    const oauthError = searchParams.get("error");
    if (oauthError) {
      setError(oauthError);
      return;
    }
    if (!token || !rawUser) {
      setError("Google sign-in did not complete. Please try again.");
      return;
    }
    let user: User;
    try {
      user = JSON.parse(decodeURIComponent(rawUser)) as User;
    } catch {
      setError("Google sign-in did not complete. Please try again.");
      return;
    }
    setSession(token, user);
    if (user.role === "ADMIN") navigate("/admin", { replace: true });
    else if (user.role === "RESTAURANT") navigate("/dashboard", { replace: true });
    else navigate("/login", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="boot-screen">
        <p>{error}</p>
        <a className="link-button" href="/login">
          Back to sign in
        </a>
      </div>
    );
  }

  return <div className="boot-screen">Completing sign-in…</div>;
}
