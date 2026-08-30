import { REPO_URL, hasRepo } from "../lib/site";
import type { ShareCard } from "../lib/build";

const BACK: React.CSSProperties = {
  alignSelf: "flex-start", marginTop: 22, background: "none",
  border: "1px solid var(--color-divider)", borderRadius: 999,
  padding: "10px 18px", font: "inherit", fontSize: 13, cursor: "pointer",
  color: "var(--color-text)", minHeight: 44,
};

interface Props {
  card: ShareCard;
  yearLabel: string;
  canShare: boolean;
  shared: boolean;
  copied: boolean;
  onBack: () => void;
  onShare: () => void;
  onCopyLink: () => void;
}

export function Share({ card, yearLabel, canShare, shared, copied, onBack, onShare, onCopyLink }: Props) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", width: "100%", maxWidth: 520, marginInline: "auto", padding: "0 clamp(22px, 4vw, 48px) 40px" }}>
      <button type="button" onClick={onBack} className="chip" style={BACK}>← Back</button>

      <div style={{ marginTop: 22, background: "var(--color-accent-900)", color: "var(--color-neutral-100)", borderRadius: "var(--radius-lg)", padding: "30px 26px", position: "relative", overflow: "hidden" }}>
        <span style={{ position: "absolute", right: -50, top: -50, width: 150, height: 150, borderRadius: 999, background: "var(--color-accent-800)", display: "block" }} />
        <p style={{ margin: 0, position: "relative", fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-accent-300)" }}>
          {card.kicker}
        </p>
        <p style={{ margin: "8px 0 0", position: "relative", fontFamily: "var(--font-heading)", fontSize: 40, lineHeight: 1, letterSpacing: "-0.02em" }}>
          {card.big}
        </p>
        <p style={{ margin: "10px 0 0", position: "relative", fontSize: 14, lineHeight: 1.45, color: "var(--color-accent-200)" }}>
          {card.sub}
        </p>
        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", position: "relative" }}>
          {card.lines.map((line) => (
            <div key={line.label} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, borderTop: "1px solid var(--color-accent-800)", padding: "11px 0" }}>
              <span style={{ fontSize: 14, lineHeight: 1.3 }}>{line.label}</span>
              <span style={{ fontFamily: "var(--font-heading)", fontSize: 16, whiteSpace: "nowrap" }}>{line.amount}</span>
            </div>
          ))}
        </div>
        <p style={{ margin: "22px 0 0", position: "relative", fontSize: 12, color: "var(--color-accent-300)" }}>
          Government budget, {yearLabel} · whereismytaxmoney.com
        </p>
      </div>

      <button type="button" onClick={onShare} className="btn-cta" style={{ width: "100%", marginTop: 20, border: 0, borderRadius: 999, background: "var(--color-accent)", color: "var(--color-bg)", font: "inherit", fontSize: 16, fontWeight: 700, padding: 17, cursor: "pointer", minHeight: 54 }}>
        {shared ? "Message copied" : canShare ? "Share" : "Copy the whole message"}
      </button>
      <button type="button" onClick={onCopyLink} className="chip" style={{ width: "100%", marginTop: 18, border: "1px solid var(--color-divider)", borderRadius: 999, background: "none", font: "inherit", fontSize: 15, padding: 15, cursor: "pointer", color: "var(--color-text)", minHeight: 48 }}>
        {copied ? "Link copied" : "Copy the link only"}
      </button>
      <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.45, color: "var(--color-neutral-700)" }}>
        {canShare
          ? "Sends the summary above and the link, through your phone's share sheet."
          : "Copies the summary above with the link on the end, ready to paste into a chat."}
      </p>
      <p style={{ margin: "18px 0 0", fontSize: 13, lineHeight: 1.45, color: "var(--color-neutral-800)" }}>
        Either way the link reopens this exact view, with the same amount, year and part. It carries
        nothing else.
      </p>
      {hasRepo() ? (
        <p style={{ margin: "14px 0 0", fontSize: 13, lineHeight: 1.45, color: "var(--color-neutral-700)" }}>
          If it was worth sending on,{" "}
          <a href={REPO_URL} target="_blank" rel="noopener">a star on GitHub</a> helps other people
          find it.
        </p>
      ) : null}
    </div>
  );
}
