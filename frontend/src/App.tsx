import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { StoreProvider } from "./lib/store.tsx";
import CreateSeries from "./pages/CreateSeries.tsx";
import Home from "./pages/Home.tsx";
import JoinLink from "./pages/JoinLink.tsx";
import Profile from "./pages/Profile.tsx";
import Friends, { AddFriendLink } from "./pages/Friends.tsx";
import Clans, { ClanDetail, JoinClanLink } from "./pages/Clans.tsx";
import ClanChat from "./pages/ClanChat.tsx";
import { SeriesBet, SeriesHome, SeriesLeaderboard, SeriesRules } from "./pages/SeriesRoutes.tsx";

// Alea Wrapped: loaded only when opened. /wrapped-demo is public (fictional data), so it renders without sign-in.
const Wrapped = lazy(() => import("./pages/Wrapped.tsx"));
function WrappedFallback() { return <div className="boot"><span className="brand-name">Alea</span><p className="cap">Gathering the receipts…</p></div>; }
function WrappedDemoOrStore({ children }: { children: ReactNode }) {
  if (useLocation().pathname === "/wrapped-demo") return <Suspense fallback={<WrappedFallback />}><Wrapped forceDemo /></Suspense>;
  return <StoreProvider>{children}</StoreProvider>;
}

export default function App() {
  return (
    <BrowserRouter>
      <WrappedDemoOrStore>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/new" element={<CreateSeries />} />
          <Route path="/join/:code" element={<JoinLink />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/wrapped" element={<Suspense fallback={<WrappedFallback />}><Wrapped /></Suspense>} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/add/:code" element={<AddFriendLink />} />
          <Route path="/clans" element={<Clans />} />
          <Route path="/clans/chat" element={<Navigate to="/clans" replace />} />
          <Route path="/clans/:clanId" element={<ClanDetail />} />
          <Route path="/clans/:clanId/chat" element={<ClanChat />} />
          <Route path="/clan/:code" element={<JoinClanLink />} />
          <Route path="/s/:id" element={<SeriesHome />} />
          <Route path="/s/:id/bets/:betId" element={<SeriesBet />} />
          <Route path="/s/:id/leaderboard" element={<SeriesLeaderboard />} />
          <Route path="/s/:id/rules" element={<SeriesRules />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </WrappedDemoOrStore>
    </BrowserRouter>
  );
}
