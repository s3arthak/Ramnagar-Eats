import { Suspense } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { FoodSpinner } from "./FoodSpinner";
import { History, Home, LogOut, Truck } from "lucide-react";

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      {/* Top bar */}
      <header className="rider-topbar">
        <a className="brand" href="/" aria-label="Ramnagar Eats — Rider">
          <span className="brand-mark" aria-hidden="true">🍛</span>
          <span className="brand-name">RAMNAGAR <b>EATS</b></span>
          <span className="brand-badge">RIDER</span>
        </a>
        <div className="topbar-right">
          {user && (
            <button className="topbar-user" onClick={() => navigate("/profile")}>
              <span className="topbar-avatar">{user.name.charAt(0)}</span>
              <span className="topbar-name">{user.name.split(" ")[0]}</span>
            </button>
          )}
          <button
            className="topbar-logout"
            onClick={() => void logout().then(() => navigate("/login"))}
            aria-label="Sign out"
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="rider-main">
        <Suspense fallback={<FoodSpinner />}>
          {children}
        </Suspense>
      </main>

      {/* Bottom navigation */}
      <nav className="rider-bottomnav" aria-label="Rider navigation">
        <NavLink to="/" end className={({ isActive }) => `bottomnav-item ${isActive ? "active" : ""}`}>
          <Home size={20} />
          <span>Home</span>
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => `bottomnav-item ${isActive ? "active" : ""}`}>
          <History size={20} />
          <span>History</span>
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => `bottomnav-item ${isActive ? "active" : ""}`}>
          <Truck size={20} />
          <span>Profile</span>
        </NavLink>
      </nav>
    </div>
  );
}
