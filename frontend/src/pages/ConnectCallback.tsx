import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Shell } from "../components/Shell.tsx";
import { Empty, Panel } from "../components/ui.tsx";
import { callbackUrl, takeConnectState, type ProviderId } from "../lib/links.tsx";
import { request, useStore } from "../lib/store.tsx";

const NAMES: Record<string, string> = { strava: "Strava", fitbit: "Fitbit", oura: "Oura", whoop: "Whoop", spotify: "Spotify" };

/** /connect/:provider/callback: an app sends people back here after they approve (or decline) access. */
export default function ConnectCallback() {
  const { provider = "" } = useParams();
  const [params] = useSearchParams();
  const { toast } = useStore();
  const nav = useNavigate();
  const [problem, setProblem] = useState<string | null>(null);
  const tried = useRef(false);
  const name = NAMES[provider] ?? "That app";

  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    const saved = takeConnectState(provider);
    if (!NAMES[provider]) {
      setProblem("That app can't be linked.");
      return;
    }
    if (params.get("error")) {
      setProblem(`You didn't give Bookie access on ${name}.`);
      return;
    }
    if (!saved || params.get("state") !== saved.state) {
      setProblem(`That ${name} sign-in didn't start here, or it expired. Link it again from your profile.`);
      return;
    }
    request<{ synced: number }>("POST", `/links/${provider}/exchange`, {
      code: params.get("code") ?? "",
      scope: params.get("scope") ?? "",
      redirectUri: callbackUrl(provider as ProviderId),
      codeVerifier: saved.verifier,
    })
      .then((r) => {
        toast(`${name} linked. Copied ${r.synced} ${r.synced === 1 ? "item" : "items"}.`);
        nav("/profile", { replace: true });
      })
      .catch((e) => setProblem(e instanceof Error ? e.message : `Couldn't link ${name}.`));
  }, [params, provider, name, nav, toast]);

  return (
    <Shell crumbs={[{ label: "Profile", to: "/profile" }, { label: name }]}>
      <Panel>
        {problem ? (
          <Empty title={`${name} isn't linked`}>
            {problem}{" "}
            <Link to="/profile" className="red-t">
              Back to your profile
            </Link>
          </Empty>
        ) : (
          <Empty title={`Linking ${name}…`} />
        )}
      </Panel>
    </Shell>
  );
}
