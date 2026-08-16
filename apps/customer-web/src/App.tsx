import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./App.css";
import "./App-extra.css";
import "./components/ui/ui.css";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { LocationProvider, useLocation } from "./context/LocationContext";
import { ToastProvider } from "./context/ToastContext";
import { Layout } from "./components/Layout";
import { LocationSheet } from "./components/LocationSheet";
import { CartDrawer } from "./components/CartDrawer";
import { HomePage } from "./pages/HomePage";
import { RestaurantsPage } from "./pages/RestaurantsPage";
import { RestaurantPage } from "./pages/RestaurantPage";
import { LoginPage } from "./pages/LoginPage";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage";
import { CartPage } from "./pages/CartPage";
import { AddressesPage } from "./pages/AddressesPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { OrderSuccessPage } from "./pages/OrderSuccessPage";
import { OrdersPage } from "./pages/OrdersPage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { ProfilePage } from "./pages/ProfilePage";
import { RequireAuth } from "./components/RequireAuth";

function Shell() {
  const { place } = useLocation();
  const [locationOpen, setLocationOpen] = useState(!place);

  useEffect(() => {
    if (!place) setLocationOpen(true);
  }, [place]);

  return (
    <>
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
      {locationOpen && <LocationSheet onClose={() => setLocationOpen(false)} />}
      <CartDrawer />
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
