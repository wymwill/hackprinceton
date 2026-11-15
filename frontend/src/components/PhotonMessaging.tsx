import { useEffect, useState } from "react";
import { request, useStore } from "../lib/store.tsx";
import { Panel, DisclosurePanel } from "./ui.tsx";

type Status = { configured: boolean; connected: boolean; alerts?: boolean; address?: string };
type Pair = { code: string; address: string; expiresAt: string };
export function PhotonMessaging() {
  const [status,setStatus] = useState<Status | null>(null);
  const [pair,setPair] = useState<Pair | null>(null);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  useEffect(() => {
    let active=true;
    const load=()=>request<Status>("GET","/photon").then(s=>{if(active) {setStatus(s);if(s.connected) setPair(null);}}).catch(e=>{if(active)setError(e.message);});
    void load(); const timer=setInterval(load,5000);
    return ()=>{active=false;clearInterval(timer);};
  },[]);
  async function act(disconnect=false) {
    setBusy(true);setError("");
    try {
      if(disconnect) {await request("DELETE","/photon");setStatus(s=>s?{...s,connected:false}:s);setPair(null);}
      else setPair(await request<Pair>("POST","/photon/pair",{}));
    } catch(e) {setError(e instanceof Error?e.message:"Try again.");} finally {setBusy(false);}
  }
  return <Panel label="Text Bookie"><div className="stack">
    <p className="hint">Get results and send proof from iMessage.</p>
    {error && <p className="notice" role="alert">{error}</p>}
    {!status ? <p className="hint">{error?"":"Loading…"}</p> : !status.configured ? <p className="hint">iMessage is coming soon. Server setup is required.</p> : status.connected ? <>
      <p>Connected · Result alerts {status.alerts?"on":"paused"}</p>
      <p className="hint">Text <b>BETS</b> to send proof or <b>RESULTS</b> for standings. <b>STOP</b> pauses alerts; <b>START</b> resumes them.</p>
      <button type="button" className="btn ghost sm" disabled={busy} onClick={()=>act(true)}>Disconnect iMessage</button>
    </> : <>
      {pair ? <><p>Send this privately to <b>{pair.address}</b>:</p><code className="photon-code">LINK {pair.code}</code>
        <p className="hint">Expires in 10 minutes. Keep the code private. Pairing turns on result alerts.</p>
        <a className="btn sm" href={`sms:${encodeURIComponent(pair.address)}?body=${encodeURIComponent(`LINK ${pair.code}`)}`}>Open Messages</a>
      </> : <p className="hint">Pair once to get result alerts. Proof goes to your game members for host review.</p>}
      <button type="button" className="btn sm" disabled={busy} onClick={()=>act()}>{busy?"Creating code…":pair?"New pairing code":"Connect iMessage"}</button>
    </>}
  </div></Panel>;
}

type Proof = {id:string;user_id:string;body:string;attachment_id:string|null;created_at:string};
export function PhotonProof({betId}:{betId:string}) {
  const {name}=useStore();
  const [items,setItems]=useState<Proof[]>([]);
  const [images,setImages]=useState<Record<string,string>>({});
  const [error,setError]=useState("");
  const [busy,setBusy]=useState<string|null>(null);
  const [enabled,setEnabled]=useState(false);
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      try {
        const status=await request<Status>("GET","/photon");
        if(!active) return;
        setEnabled(status.configured); if(!status.configured)return;
        const rows=await request<Proof[]>("GET",`/photon/proof?betId=${betId}`);
        if(active) {setItems(rows);setError("");}
      } catch(e){if(active)setError(e instanceof Error?e.message:"Can't load proof.");}
    };
    void load();const timer=setInterval(load,10000);
    return ()=>{active=false;clearInterval(timer);};
  },[betId]);
  async function image(id:string) {
    setBusy(id);setError("");
    try { const r=await request<{image:string}>("POST","/photon/proof",{id});setImages(old=>({...old,[id]:r.image})); }
    catch(e){setError(e instanceof Error?e.message:"Can't load image.");} finally{setBusy(null);}
  }
  if(!enabled&&!error)return null;
  return <DisclosurePanel label={`iMessage proof${items.length?` · ${items.length}`:""}`} className="proof-panel"><div className="stack">
    <p className="hint">Text <b>PROOF {betId.slice(0,8)}</b> to Bookie, then send an image or note. The host reviews it.</p>
    {error&&<p className="notice" role="alert">{error}</p>}
    {!items.length&&<p className="hint">No proof sent yet.</p>}
    {items.map(p=><article className="photon-proof" key={p.id}><b>{name(p.user_id)}</b><small className="dim">{new Date(p.created_at).toLocaleString()}</small>
      {p.body&&<p>{p.body}</p>}
      {p.attachment_id&&(images[p.id]?<img src={images[p.id]} alt={`Evidence sent by ${name(p.user_id)}`} loading="lazy"/>:<button type="button" className="btn sm" disabled={!!busy} onClick={()=>image(p.id)}>{busy===p.id?"Loading…":"View image"}</button>)}
    </article>)}
    <p className="hint">Submitted by players. Bookie has not verified this evidence.</p>
  </div></DisclosurePanel>;
}
