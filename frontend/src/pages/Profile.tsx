import { useEffect, useMemo, useRef, useState } from "react";
import { Shell } from "../components/Shell.tsx";
import { Panel, initialsOf } from "../components/ui.tsx";
import { AVATAR_STYLES, avatarUrl, parseAvatar, randomSeed, uploadAvatar, type AvatarStyle } from "../lib/avatars.ts";
import { fmt } from "../lib/format.ts";
import { supabase } from "../lib/supabase.ts";
import { useStore } from "../lib/store.tsx";
import { useTheme, type ThemePref } from "../lib/theme.ts";

type Pick = { kind: "style"; style: AvatarStyle; seed: string } | { kind: "image"; url: string } | { kind: "initials" };

const PAGE = 12;
const seeds = (n: number) => Array.from({ length: n }, randomSeed);

/** Your name, your picture and your record across every series. */
export default function Profile() {
  const { me, meUser, db, saveProfile, toast } = useStore();
  const [name, setName] = useState(meUser.name);
  const [googlePhoto, setGooglePhoto] = useState<string | null>(null);
  const [pick, setPick] = useState<Pick>(() => {
    const parsed = parseAvatar(meUser.avatarUrl);
    if (parsed) return { kind: "style", ...parsed };
    return meUser.avatarUrl ? { kind: "image", url: meUser.avatarUrl } : { kind: "initials" };
  });
  // The pictures on offer: your current one first, then more each time you ask.
  const [options, setOptions] = useState<string[]>(() => {
    const parsed = parseAvatar(meUser.avatarUrl);
    return parsed ? [parsed.seed, ...seeds(PAGE - 1)] : seeds(PAGE);
  });
  const [style, setStyle] = useState<AvatarStyle>(() => parseAvatar(meUser.avatarUrl)?.style ?? AVATAR_STYLES[0].id);
  const [uploaded, setUploaded] = useState<string | null>(() => (meUser.avatarUrl && !parseAvatar(meUser.avatarUrl) ? meUser.avatarUrl : null));
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const { pref, choose } = useTheme();

  // A Google account's own photo, so it can be picked again after trying other styles.
  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata ?? {};
      // Google keeps the original in "picture"; avatar_url is whatever was saved here last.
      const photo = meta.picture as string | undefined;
      if (photo?.startsWith("https://")) setGooglePhoto(photo);
    });
  }, []);

  const url = pick.kind === "style" ? avatarUrl(pick.style, pick.seed) : pick.kind === "image" ? pick.url : null;

  const showMore = () => {
    setOptions((o) => [...o, ...seeds(PAGE)]);
    // Bring the new row into view inside the scrolling grid.
    requestAnimationFrame(() => gridRef.current?.scrollTo({ top: gridRef.current.scrollHeight, behavior: "smooth" }));
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const u = await uploadAvatar(file);
      setUploaded(u);
      setPick({ kind: "image", url: u });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed.", "err");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const trimmed = name.trim();
  const changed = trimmed !== meUser.name || (url ?? null) !== (meUser.avatarUrl ?? null);

  const record = useMemo(() => {
    let wins = 0, bottom = 0, finished = 0, live = 0, betsWon = 0, betsPlayed = 0, net = 0, favorsOwed = 0, favorsDone = 0;
    for (const s of db.series) {
      const plays = s.members.some((m) => m.userId === me && m.plays);
      if (s.status === "finished" || s.status === "assigning") {
        if (plays) {
          finished++;
          const st = s.standings.find((x) => x.userId === me);
          if (st?.rank === 1) wins++;
          if (st?.losing) bottom++;
        }
      } else live++;
      for (const b of s.bets) {
        const r = b.results?.find((x) => x.userId === me);
        if (!r || b.refunded) continue;
        betsPlayed++;
        net += r.net;
        if (r.net > 0) betsWon++;
      }
      for (const a of s.assignments) {
        if (a.loserId !== me || a.status === "declined") continue;
        if (a.done) favorsDone++;
        else favorsOwed++;
      }
    }
    return { series: db.series.length, live, finished, wins, bottom, betsWon, betsPlayed, net, favorsOwed, favorsDone };
  }, [db, me]);

  const save = async () => {
    setSaving(true);
    await saveProfile({ name: trimmed, avatarUrl: url });
    setSaving(false);
  };

  return (
    <Shell crumbs={[{ label: "Profile" }]}>
      <div className="profile">
        <section className="hero">
          <div>
            <h1>Your profile</h1>
            <p>This is how friends see you in every series.</p>
          </div>
        </section>

        <div className="grid2">
          <div className="col">
            <Panel label="You">
              <div className="profile-card">
                {url ? <img className="avatar xl me" src={url} alt="" referrerPolicy="no-referrer" /> : <span className="avatar xl me">{initialsOf(trimmed || "?")}</span>}
                <div className="stack" style={{ flex: 1, minWidth: 0 }}>
                  <label className="field">
                    <span>Display name</span>
                    <input className="input text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="What friends call you" />
                  </label>
                  {meUser.email && <p className="hint">Signed in as {meUser.email}</p>}
                </div>
              </div>
            </Panel>

            <Panel label="Picture">
              <div className="stack">
                <div className="seg">
                  {AVATAR_STYLES.map((st) => (
                    <button key={st.id} type="button" className={style === st.id ? "on" : ""} onClick={() => setStyle(st.id)}>
                      {st.label}
                    </button>
                  ))}
                </div>
                <div className="avatar-grid" ref={gridRef}>
                  {(uploaded || googlePhoto) && (
                    <>
                      {uploaded && <ImageOption url={uploaded} on={pick.kind === "image" && pick.url === uploaded} onPick={() => setPick({ kind: "image", url: uploaded })} label="Your upload" />}
                      {googlePhoto && googlePhoto !== uploaded && (
                        <ImageOption url={googlePhoto} on={pick.kind === "image" && pick.url === googlePhoto} onPick={() => setPick({ kind: "image", url: googlePhoto })} label="Google photo" />
                      )}
                    </>
                  )}
                  {options.map((seed) => (
                    <ImageOption
                      key={seed}
                      url={avatarUrl(style, seed)}
                      on={pick.kind === "style" && pick.style === style && pick.seed === seed}
                      onPick={() => setPick({ kind: "style", style, seed })}
                    />
                  ))}
                </div>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <button type="button" className="btn sm" onClick={showMore}>
                    Show more
                  </button>
                  <button type="button" className="btn sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? "Uploading…" : "Upload a photo"}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
                  <button type="button" className={`btn sm ${pick.kind === "initials" ? "primary" : ""}`} onClick={() => setPick({ kind: "initials" })}>
                    Just initials
                  </button>
                </div>
              </div>
            </Panel>

            <Panel label="Appearance">
              <div className="seg">
                {(["system", "light", "dark"] as ThemePref[]).map((t) => (
                  <button key={t} type="button" className={pref === t ? "on" : ""} onClick={() => choose(t)}>
                    {t === "system" ? "Match device" : t === "light" ? "Light" : "Dark"}
                  </button>
                ))}
              </div>
            </Panel>
          </div>

          <div className="col" style={{ position: "sticky", top: "calc(var(--top) + 24px)" }}>
            <Panel label="Your record">
              <div className="record">
                <Stat label="Series" value={record.series} />
                <Stat label="Won" value={record.wins} />
                <Stat label="Bottom" value={record.bottom} />
                <Stat label="Bets won" value={`${record.betsWon}/${record.betsPlayed}`} />
                <Stat label="Coins" value={`${record.net > 0 ? "+" : ""}${fmt(record.net)}`} tone={record.net > 0 ? "up" : record.net < 0 ? "down" : undefined} />
                <Stat label="Punishments done" value={`${record.favorsDone}${record.favorsOwed ? ` · ${record.favorsOwed} owed` : ""}`} />
              </div>
            </Panel>
            <button type="button" className="btn primary block" onClick={save} disabled={!trimmed || !changed || saving}>
              {saving ? "Saving…" : changed ? "Save profile" : "Saved"}
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "up" | "down" }) {
  return (
    <div className="stat">
      <span className="cap">{label}</span>
      <b className={tone ?? ""}>{value}</b>
    </div>
  );
}

function ImageOption({ url, on, onPick, label = "Use this picture" }: { url: string; on: boolean; onPick: () => void; label?: string }) {
  return (
    <button type="button" className={`avatar-opt ${on ? "on" : ""}`} onClick={onPick} aria-label={label} title={label}>
      <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" />
    </button>
  );
}
