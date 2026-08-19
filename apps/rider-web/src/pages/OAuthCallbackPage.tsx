import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { User } from "../lib/types";

export function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const { setSession } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get("token");
    const userJson = params.get("user");
    const error = params.get("error");
    if (error) { navigate("/login"); return; }
    if (token && userJson) {
      try {
        const user = JSON.parse(decodeURIComponent(userJson)) as User;
        setSession(token, user);
        if (!user.vehicleType) navigate("/setup");
        else navigate("/");
      } catch { navigate("/login"); }
    } else { navigate("/login"); }
  }, [params, setSession, navigate]);

  return <div className="loading">Signing you in…</div>;
}
