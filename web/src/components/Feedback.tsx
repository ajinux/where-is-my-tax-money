import { useState } from "react";
import { feedbackUrl, hasRepo, repoIssues, type FeedbackCategory } from "../lib/site";

/**
 * What a reader would call the problem, paired with the category the form files
 * it under. The two vocabularies are deliberately different: "Data issue" is how
 * you triage a report, "A number looks wrong" is how somebody arrives at one.
 */
const TOPICS: { label: string; category: FeedbackCategory }[] = [
  { label: "A number looks wrong", category: "Data issue" },
  { label: "Something is broken", category: "Bug" },
  { label: "I don't understand something", category: "Feedback" },
  { label: "The wording is confusing", category: "Feedback" },
];

/** The primary action, worn by a link when there is something to send and a disabled button when there is not. */
const ACTION: React.CSSProperties = {
  width: "100%",
  marginTop: 20,
  border: 0,
  borderRadius: 999,
  background: "var(--color-accent)",
  color: "var(--color-bg)",
  font: "inherit",
  fontSize: 16,
  fontWeight: 700,
  padding: 17,
  cursor: "pointer",
  minHeight: 54,
};

export function Feedback({ onBack }: { onBack: () => void }) {
  const [topic, setTopic] = useState(TOPICS[0]);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const ready = message.trim().length > 0;

  // Built at render rather than on click so the primary action can be a real
  // link. A popup opened from a handler is at the mercy of the blocker; an
  // anchor is not, and it middle-clicks and keyboard-opens like anything else.
  const href = feedbackUrl({
    category: topic.category,
    report: message,
    email,
    href: typeof window === "undefined" ? "" : window.location.href,
  });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", width: "100%", maxWidth: 560, marginInline: "auto", padding: "0 clamp(22px, 4vw, 48px) 40px" }}>
      <button type="button" onClick={onBack} className="chip" style={{ alignSelf: "flex-start", marginTop: 22, background: "none", border: "1px solid var(--color-divider)", borderRadius: 999, padding: "10px 18px", font: "inherit", fontSize: 13, cursor: "pointer", color: "var(--color-text)", minHeight: 44 }}>
        ← Back
      </button>

      <h2 style={{ margin: "24px 0 0", fontFamily: "var(--font-heading)", fontSize: "clamp(30px, 2.8vw, 38px)", lineHeight: 1.08, letterSpacing: "-0.02em" }}>
        Tell us what’s wrong
      </h2>
      <p style={{ margin: "12px 0 0", fontSize: 15, lineHeight: 1.5, color: "var(--color-neutral-800)", textWrap: "pretty" }}>
        A wrong number, something that makes no sense, a word that reads badly. You do not need to
        know where the data came from. Describing the problem is enough.
      </p>

      {sent ? (
        <div style={{ marginTop: 22, background: "var(--color-accent-2-200)", borderRadius: "var(--radius-lg)", padding: "18px 20px" }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--color-accent-2-900)" }}>
            The form is open in a new tab.
          </p>
          <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.5, color: "var(--color-accent-2-900)" }}>
            Everything you wrote is already filled in, but it does not reach us until you press
            Submit there. If no tab opened,{" "}
            <a href={href} target="_blank" rel="noopener">
              open the form here
            </a>
            .
          </p>
        </div>
      ) : (
        <div style={{ marginTop: 22 }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--color-neutral-700)" }}>
            What is this about?
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {TOPICS.map((option) => {
              const on = topic.label === option.label;
              return (
                <button
                  key={option.label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTopic(option)}
                  style={{
                    border: `1.5px solid ${on ? "var(--color-accent)" : "var(--color-divider)"}`,
                    background: on ? "var(--color-accent)" : "transparent",
                    color: on ? "var(--color-bg)" : "var(--color-text)",
                    borderRadius: 999, padding: "11px 16px", minHeight: 44,
                    font: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <label htmlFor="fb-msg" style={{ display: "block", marginTop: 20, marginBottom: 6, fontSize: 13, fontWeight: 600, color: "var(--color-neutral-700)" }}>
            In your own words
          </label>
          <textarea
            id="fb-msg"
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="The defence figure looks too low compared with what I read in the budget."
            style={{ width: "100%", background: "var(--color-neutral-100)", border: "1.5px solid var(--color-neutral-300)", borderRadius: "var(--radius-md)", padding: "12px 14px", font: "inherit", fontSize: 15, lineHeight: 1.5, color: "var(--color-text)", resize: "vertical" }}
          />

          <label htmlFor="fb-mail" style={{ display: "block", marginTop: 16, marginBottom: 6, fontSize: 13, fontWeight: 600, color: "var(--color-neutral-700)" }}>
            Email, if you want a reply
          </label>
          <input
            id="fb-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Optional"
            style={{ width: "100%", background: "var(--color-neutral-100)", border: "1.5px solid var(--color-neutral-300)", borderRadius: 999, padding: "12px 18px", font: "inherit", fontSize: 15, color: "var(--color-text)" }}
          />

          {ready ? (
            <a
              href={href}
              target="_blank"
              rel="noopener"
              onClick={() => setSent(true)}
              className="btn-cta"
              style={{ ...ACTION, display: "block", textAlign: "center", textDecoration: "none" }}
            >
              Open the form
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="btn-cta"
              style={{ ...ACTION, cursor: "not-allowed", opacity: 0.45 }}
            >
              Open the form
            </button>
          )}

          <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.45, color: "var(--color-neutral-700)" }}>
            Opens a short form with this already filled in. It records the page you are on, but
            never the amount you entered.
          </p>

          {hasRepo() ? (
            <p style={{ margin: "14px 0 0", fontSize: 13, lineHeight: 1.45, color: "var(--color-neutral-700)" }}>
              If you’d rather file it as an issue, the code and the data are on{" "}
              <a href={repoIssues()} target="_blank" rel="noopener">GitHub</a>.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
