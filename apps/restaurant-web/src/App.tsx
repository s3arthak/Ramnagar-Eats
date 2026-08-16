import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import "./App.css";
import "./App-extra.css";
import "./components/ui/ui.css";
import { loadConfig } from "./lib/config";
import { AuthProvider, useAuth } from "./context/AuthContext";

// Warm the server config (currency, brand) as early as possible.
void loadConfig();
import { ToastProvider } from "./context/ToastContext";
import { api } from "./lib/api";
import type { RestaurantProfile } from "./lib/types";
import { Shell } from "./components/Shell";
import { LoginPage } from "./pages/LoginPage";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage";
import { DashboardPage } from "./pages/DashboardPage";
import { OrdersPage } from "./pages/OrdersPage";
import { MenuPage } from "./pages/MenuPage";
import { RestaurantPage } from "./pages/RestaurantPage";
import { AdminPage } from "./pages/AdminPage";

function Workspace() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [restaurant, setRestaurant] = useState<RestaurantProfile | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (user.role === "RESTAURANT") {
      api
        .get<{ restaurant: RestaurantProfile | null }>("/restaurants/me")
        .then((data) => setRestaurant(data.restaurant))
        .catch(() => undefined);
    }
  }, [user, loading, navigate]);

  if (loading) {
    return <div className="boot-screen">Loading Ramnagar Eats…</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isRestaurant = user.role === "RESTAURANT";
  const isAdmin = user.role === "ADMIN";

  if (isAdmin) {
    return (
      <Shell restaurant={null} onRestaurantChange={() => undefined} isAdmin>
        <Routes>
          <Route path="/login" element={<Navigate to="/admin" replace />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Shell>
    );
  }

  if (!isRestaurant) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Shell restaurant={restaurant} onRestaurantChange={setRestaurant} isAdmin={false}>
      <Routes>
        <Route path="/login" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage onSetup={() => navigate("/restaurant")} />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/restaurant" element={<RestaurantPage restaurant={restaurant} onChange={setRestaurant} />} />
        <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Shell>
  );
}

function Root() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route path="/*" element={<Workspace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Root />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
