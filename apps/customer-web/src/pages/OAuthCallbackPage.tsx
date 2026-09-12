import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { User } from "../lib/types";
import { Spinner } from "../components/ui/Skeleton";
import { routeByRole } from "./LoginPage";

export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    // Google found no account — hand the user to the create-account flow.
    if (searchParams.get("needsAccount") === "1") {
      const params = new URLSearchParams({ needsAccount: "1" });
      const googleId = searchParams.get("googleId");
      const gemail = searchParams.get("gemail");
      const gname = searchParams.get("gname");
      if (googleId) params.set("googleId", googleId);
      if (gemail) params.set("gemail", gemail);
      if (gname) params.set("gname", gname);
      navigate(`/login?${params.toString()}`, { replace: true });
      return;
    }

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
    let parsed: User;
    try {
      parsed = JSON.parse(decodeURIComponent(rawUser)) as User;
    } catch {
      setError("Google sign-in did not complete. Please try again.");
      return;
    }
    setSession(token, parsed);
    navigate(routeByRole(parsed), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
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

  return (
    <div className="content page">
      <Spinner label="Completing sign-in…" />
    </div>
  );
}