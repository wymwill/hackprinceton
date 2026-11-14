import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Shell } from "../components/Shell.tsx";
import { Empty, Panel } from "../components/ui.tsx";
import { useStore } from "../lib/store.tsx";

/** /join/CODE: the invite link. Signing in happens first (the store shows the sign-in screen), then this joins. */
export default function JoinLink() {
  const { code = "" } = useParams();
  const { api } = useStore();
  const nav = useNavigate();
  const [failed, setFailed] = useState(false);
  const tried = useRef(false);

  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    api.joinByCode(code, "You're in. Review the rules in the lobby.").then((s) => {
      if (s) nav(`/s/${s.id}`, { replace: true });
      else setFailed(true);
    });
  }, [api, code, nav]);

  return (
    <Shell crumbs={[{ label: "Join" }]}>
      <Panel>
        {failed ? (
          <Empty title="Couldn't join">
            The code {code.toUpperCase()} didn't work, or the series has already started.{" "}
            <Link to="/" className="red-t">
              Back to your series
            </Link>
          </Empty>
        ) : (
          <Empty title={`Joining ${code.toUpperCase()}…`} />
        )}
      </Panel>
    </Shell>
  );
}
