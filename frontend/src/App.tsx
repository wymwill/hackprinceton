import { lazy, Suspense, useLayoutEffect, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigationType, useParams } from "react-router-dom";
import { StoreProvider } from "./lib/store.tsx";
import CreateSeries from "./pages/CreateSeries.tsx";
import AllSeries from "./pages/AllSeries.tsx";
import Home from "./pages/Home.tsx";
import JoinLink from "./pages/JoinLink.tsx";
import Profile from "./pages/Profile.tsx";
import { NavigationTourProvider } from "./components/NavigationTour.tsx";
import Friends, { AddFriendLink } from "./pages/Friends.tsx";
import Clans, { ClanDetail, JoinClanLink } from "./pages/Clans.tsx";
import ClanChat from "./pages/ClanChat.tsx";
import { SeriesBet, SeriesHome, SeriesLeaderboard, SeriesRules } from "./pages/SeriesRoutes.tsx";
import SeriesRecap from "./pages/Recap.tsx";

// Bookie Wrapped: loaded only when opened. /wrapped-demo is public (fictional data), so it renders without sign-in.
const Wrapped = lazy(() => import("./pages/Wrapped.tsx"));
function WrappedFallback() { return <div className="boot"><span className="brand-name">Bookie</span><p className="cap">Gathering the receipts…</p></div>; }
function WrappedDemoOrStore({ children }: { children: ReactNode }) {
  if (useLocation().pathname === "/wrapped-demo") return <Suspense fallback={<WrappedFallback />}><Wrapped forceDemo /></Suspense>;
  return <StoreProvider><NavigationTourProvider>{children}</NavigationTourProvider></StoreProvider>;
}
/** A new page opens at the top. Back and forward (POP) keep the browser's own scroll restore. */
function ScrollToTop() {
  const { pathname } = useLocation();
  const type = useNavigationType();
  useLayoutEffect(() => {
    if (type !== "POP") window.scrollTo(0, 0);
  }, [pathname, type]);
  return null;
}
function LegacyClanRoute({ chat = false }: { chat?: boolean }) {
  const { clanId = "" } = useParams();
  return <Navigate to={`/groups/${encodeURIComponent(clanId)}${chat ? "/chat" : ""}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <WrappedDemoOrStore>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/series" element={<AllSeries />} />
          <Route path="/new" element={<CreateSeries />} />
          <Route path="/join/:code" element={<JoinLink />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/tutorial" element={<Navigate to="/?tour=1" replace />} />
          <Route path="/wrapped" element={<Suspense fallback={<WrappedFallback />}><Wrapped /></Suspense>} />
          <Route path="/connect/:provider/callback" element={<Navigate to="/profile" replace />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/add/:code" element={<AddFriendLink />} />
          <Route path="/groups" element={<Clans />} />
          <Route path="/groups/:clanId" element={<ClanDetail />} />
          <Route path="/groups/:clanId/chat" element={<ClanChat />} />
          <Route path="/group/:code" element={<JoinClanLink />} />
          <Route path="/clans" element={<Navigate to="/groups" replace />} />
          <Route path="/clans/chat" element={<Navigate to="/groups" replace />} />
          <Route path="/clans/:clanId" element={<LegacyClanRoute />} />
          <Route path="/clans/:clanId/chat" element={<LegacyClanRoute chat />} />
          <Route path="/clan/:code" element={<JoinClanLink />} />
          <Route path="/s/:id" element={<SeriesHome />} />
          <Route path="/s/:id/bets/:betId" element={<SeriesBet />} />
          <Route path="/s/:id/leaderboard" element={<SeriesLeaderboard />} />
          <Route path="/s/:id/rules" element={<SeriesRules />} />
          <Route path="/s/:id/recap" element={<SeriesRecap />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </WrappedDemoOrStore>
    </BrowserRouter>
  );
}
