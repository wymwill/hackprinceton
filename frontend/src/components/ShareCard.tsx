import { Panel } from "./ui.tsx";
import { prettyCode, useQr, useShare } from "../lib/social.tsx";

/** A code people can scan, AirDrop, text or read out. */
export function ShareCard({
  label, code, link, shareTitle, shareText, hint,
}: {
  label: string;
  code: string;
  link: string;
  shareTitle: string;
  shareText: string;
  hint: string;
}) {
  const qr = useQr(link);
  const { canShare, share, copy } = useShare();
  return (
    <Panel label={label}>
      <div className="share-card">
        <div className="qr" aria-label={`QR code for ${link}`} role="img" dangerouslySetInnerHTML={qr ? { __html: qr } : undefined} />
        <div className="share-code" aria-label={`Code ${code.split("").join(" ")}`}>
          {prettyCode(code)}
        </div>
        <p className="hint">{hint}</p>
        <div className="row" style={{ width: "100%" }}>
          <button type="button" className="btn primary" style={{ flex: 1 }} onClick={() => share(shareTitle, shareText, link)}>
            {canShare ? "Share or AirDrop" : "Copy link"}
          </button>
          {canShare && (
            <button type="button" className="btn" onClick={() => copy(link)}>
              Copy link
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}
