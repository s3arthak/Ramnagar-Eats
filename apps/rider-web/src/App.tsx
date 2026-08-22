import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./context/AuthContext";
import { Shell } from "./components/Shell";
import { FoodSpinner } from "./components/FoodSpinner";
import { NotificationPrompt } from "./components/NotificationPrompt";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "./rider.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });

const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const OAuthCallbackPage = lazy(() => import("./pages/OAuthCallbackPage").then((m) => ({ default: m.OAuthCallbackPage })));
const SetupPage = lazy(() => import("./pages/SetupPage").then((m) => ({ default: m.SetupPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const DeliveryPage = lazy(() => import("./pages/DeliveryPage").then((m) => ({ default: m.DeliveryPage })));
const ProfilePage = lazy(() => import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const HistoryPage = lazy(() => import("./pages/HistoryPage").then((m) => ({ default: m.HistoryPage })));

function Fallback() {
  return <FoodSpinner />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Suspense fallback={<Fallback />}><LoginPage /></Suspense>} />
            <Route path="/oauth/callback" element={<Suspense fallback={<Fallback />}><OAuthCallbackPage /></Suspense>} />
            <Route path="/setup" element={<Suspense fallback={<Fallback />}><SetupPage /></Suspense>} />
            <Route path="/" element={<Shell><Suspense fallback={<Fallback />}><DashboardPage /></Suspense></Shell>} />
            <Route path="/delivery/:orderId" element={<Shell><Suspense fallback={<Fallback />}><DeliveryPage /></Suspense></Shell>} />
            <Route path="/profile" element={<Shell><Suspense fallback={<Fallback />}><ProfilePage /></Suspense></Shell>} />
            <Route path="/history" element={<Shell><Suspense fallback={<Fallback />}><HistoryPage /></Suspense></Shell>} />
          </Routes>
          <NotificationPrompt />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
