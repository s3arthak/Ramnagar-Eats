import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation as useRouterLocation } from "react-router-dom";
import "./App.css";
import "./App-extra.css";
import "./components/ui/ui.css";
import { loadConfig } from "./lib/config";

// Warm the server config (currency, brand, delivery rules) as early as possible.
void loadConfig();
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { LocationProvider, useLocation } from "./context/LocationContext";
import { ToastProvider } from "./context/ToastContext";
import { Layout } from "./components/Layout";
import { LocationSheet } from "./components/LocationSheet";
import { CartDrawer } from "./components/CartDrawer";
import { RequireAuth } from "./components/RequireAuth";
import { NotificationPrompt } from "./components/NotificationPrompt";

// Routes are code-split so the initial bundle stays small on mobile connections
// — each chunk loads on first navigation to that page.
const HomePage = lazy(() => import("./pages/HomePage").then((m) => ({ default: m.HomePage })));
const RestaurantsPage = lazy(() => import("./pages/RestaurantsPage").then((m) => ({ default: m.RestaurantsPage })));
const RestaurantPage = lazy(() => import("./pages/RestaurantPage").then((m) => ({ default: m.RestaurantPage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const OAuthCallbackPage = lazy(() => import("./pages/OAuthCallbackPage").then((m) => ({ default: m.OAuthCallbackPage })));
const CartPage = lazy(() => import("./pages/CartPage").then((m) => ({ default: m.CartPage })));
const AddressesPage = lazy(() => import("./pages/AddressesPage").then((m) => ({ default: m.AddressesPage })));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage").then((m) => ({ default: m.CheckoutPage })));
const OrderSuccessPage = lazy(() => import("./pages/OrderSuccessPage").then((m) => ({ default: m.OrderSuccessPage })));
const OrdersPage = lazy(() => import("./pages/OrdersPage").then((m) => ({ default: m.OrdersPage })));
const OrderDetailPage = lazy(() => import("./pages/OrderDetailPage").then((m) => ({ default: m.OrderDetailPage })));
const ProfilePage = lazy(() => import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));

function PageFallback() {
  return (
    <div className="state-view" role="status" style={{ margin: "48px auto", maxWidth: 520 }}>
      <div className="food-spinner" aria-hidden="true">
        {"🍛🍕🍔🍜🥘🍲🍰🥗".split("").filter(Boolean).map((emoji, i) => (
          <span key={i} className="food-spinner-emoji" style={{ animationDelay: `${i * 0.15}s` }}>{emoji}</span>
        ))}
      </div>
      <p>Loading…</p>
    </div>
  );
}

function Shell() {
  const { place } = useLocation();
  const routerLocation = useRouterLocation();
  // Ask for the delivery area on the home page only — never pop the sheet over
  // login/sign-up (the OAuth phone step) or while the user is mid-flow elsewhere.
  const [locationOpen, setLocationOpen] = useState(() => !place && routerLocation.pathname === "/");

  useEffect(() => {
    if (!place && routerLocation.pathname === "/") setLocationOpen(true);
  }, [place, routerLocation.pathname]);

  return (
    <>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route
            path="/"
            element={
              <Layout onOpenLocation={() => setLocationOpen(true)}>
                <HomePage onOpenLocation={() => setLocationOpen(true)} />
              </Layout>
            }
          />
          <Route
            path="/restaurants"
            element={
              <Layout onOpenLocation={() => setLocationOpen(true)}>
                <RestaurantsPage onOpenLocation={() => setLocationOpen(true)} />
              </Layout>
            }
          />
          <Route
            path="/restaurant/:id"
            element={
              <Layout onOpenLocation={() => setLocationOpen(true)}>
                <RestaurantPage />
              </Layout>
            }
          />
          <Route
            path="/cart"
            element={
              <Layout onOpenLocation={() => setLocationOpen(true)}>
                <CartPage />
              </Layout>
            }
          />
          <Route
            path="/checkout"
            element={
              <Layout onOpenLocation={() => setLocationOpen(true)}>
                <RequireAuth>
                  <CheckoutPage />
                </RequireAuth>
              </Layout>
            }
          />
          <Route
            path="/addresses"
            element={
              <Layout onOpenLocation={() => setLocationOpen(true)}>
                <RequireAuth>
                  <AddressesPage />
                </RequireAuth>
              </Layout>
            }
          />
          <Route
            path="/order/:id/success"
            element={
              <Layout onOpenLocation={() => setLocationOpen(true)}>
                <RequireAuth>
                  <OrderSuccessPage />
                </RequireAuth>
              </Layout>
            }
          />
          <Route
            path="/orders"
            element={
              <Layout onOpenLocation={() => setLocationOpen(true)}>
                <RequireAuth>
                  <OrdersPage />
                </RequireAuth>
              </Layout>
            }
          />
          <Route
            path="/orders/:id"
            element={
              <Layout onOpenLocation={() => setLocationOpen(true)}>
                <RequireAuth>
                  <OrderDetailPage />
                </RequireAuth>
              </Layout>
            }
          />
          <Route
            path="/profile"
            element={
              <Layout onOpenLocation={() => setLocationOpen(true)}>
                <RequireAuth>
                  <ProfilePage />
                </RequireAuth>
              </Layout>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
        </Routes>
      </Suspense>
      {locationOpen && <LocationSheet onClose={() => setLocationOpen(false)} />}
      <CartDrawer />
      <NotificationPrompt />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <LocationProvider>
            <CartProvider>
              <Shell />
            </CartProvider>
          </LocationProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
