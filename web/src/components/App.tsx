import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { amountBucket, track } from "../lib/analytics";
import { build } from "../lib/build";
import { parseAmount } from "../lib/format";
import { linkQuery, parseLink, type LinkTarget } from "../lib/link";
import { loadYear, type LensName, type Summary, type YearData } from "../lib/model";
import { rank } from "../lib/rank";
import { SITE_NAME, REPO_URL, hasRepo } from "../lib/site";
import { AmountInput } from "./AmountInput";
import { Detail } from "./Detail";
import { Feedback } from "./Feedback";
import { Home } from "./Home";
import { GitHubIcon, LogoMark } from "./Logo";
import { Method } from "./Method";
import { Result } from "./Result";
import { Share } from "./Share";

type Screen = "home" | "input" | "result" | "detail" | "share" | "about" | "feedback";

interface State {
  screen: Screen;
  amountStr: string;
  amount: number;
  surcharge: number;
  year: string;
  lens: LensName;
  headId: string | null;
  subIndex: number | null;
  /** Which row a shared link points at, by id. Null unless one does. */
  focusId: string | null;
  /** Where "Back" returns to from the screens that can be opened from anywhere. */
  back: Screen;
}

/** The link functions live in lib/link so they can be tested; these supply the browser. */
function readUrl(summary: Summary) {
  return parseLink(window.location.search, summary);
}

function currentUrl(state: State, target?: LinkTarget) {
  return `${window.location.origin}${window.location.pathname}${linkQuery(state, target)}`;
}

async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // fall through to the textarea route
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.style.cssText = "position:fixed;top:0;left:0;opacity:0";
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand("copy");
  } catch {
    // nothing further to try; the reader can still copy the address bar
  }
  document.body.removeChild(area);
}

/**
 * How long a "copied" tick stays lit.
 */
const FLASH_MS = 1000;

/**
 * Copy feedback is a flash, not a state.
 *
 * It used to be cleared only by leaving the screen, so the tick stayed lit for
 * as long as the reader stood there. The copy itself always worked, but a
 * second press changed nothing on screen, which reads as a dead button. Each
 * press now restarts the timer, and a pending timer is cleared on unmount so it
 * cannot fire into a screen that is gone.
 */
function useFlash<T>(idle: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(idle);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback(
    (next: T) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      setValue(next);
      if (next === idle) return;
      timer.current = setTimeout(() => setValue(idle), FLASH_MS);
    },
    [idle]
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return [value, flash];
}

export function App({ summary }: { summary: Summary }) {
  const [state, setState] = useState<State>({
    screen: "home",
    amountStr: "",
    amount: 0,
    surcharge: 0,
    year: summary.latestFinal,
    lens: "purpose",
    headId: null,
    subIndex: null,
    focusId: null,
    back: "home",
  });
  const [year, setYear] = useState<YearData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copiedRow, flashCopiedRow] = useFlash<string | null>(null);
  const [copiedLink, flashCopiedLink] = useFlash(false);
  const [shared, flashShared] = useFlash(false);

  // A shared link is the only way to arrive anywhere but home.
  useEffect(() => {
    const fromUrl = readUrl(summary);
    if (fromUrl) setState((s) => ({ ...s, ...fromUrl }));
  }, [summary]);

  // Figures for the selected year, fetched once and cached.
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    loadYear(state.year)
      .then((data) => {
        if (!cancelled) setYear(data);
      })
      .catch((error: Error) => {
        if (!cancelled) setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [state.year]);

  // Keep the address bar in step, so the browser's own Back button works and the
  // URL is always the thing worth sharing. The comp never did this — it built a
  // share URL on demand and left the address bar at the root — but on a phone,
  // Back leaving the site from three levels down is a real loss.
  useEffect(() => {
    if (state.amount <= 0) return;
    const url = currentUrl(state);
    if (url !== window.location.href) {
      window.history.pushState(null, "", url);
    }
  }, [state.amount, state.surcharge, state.year, state.lens, state.headId, state.subIndex, state.focusId]);

  // The screens are states, not pages, so the pageview in Base.astro cannot see
  // them. "home" is skipped because that pageview already counts it.
  useEffect(() => {
    if (state.screen !== "home") track(`app/${state.screen}`);
  }, [state.screen]);

  // Once per amount the reader settles on, not once per keystroke or re-render.
  const measured = useRef<number | null>(null);
  useEffect(() => {
    if (state.amount <= 0 || measured.current === state.amount) return;
    measured.current = state.amount;
    track(`amount/${amountBucket(state.amount)}`);
    track(`year/${state.year}`);
  }, [state.amount, state.year]);

  useEffect(() => {
    const onPop = () => {
      const fromUrl = readUrl(summary);
      setState((s) => (fromUrl ? { ...s, ...fromUrl } : { ...s, screen: "home" }));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [summary]);

  const go = useCallback((screen: Screen, headId?: string | null, subIndex?: number | null) => {
    setState((s) => ({
      ...s,
      screen,
      headId: headId === undefined ? s.headId : headId,
      subIndex: subIndex === undefined ? null : subIndex,
      focusId: null,
    }));
    flashCopiedRow(null);
    flashCopiedLink(false);
    flashShared(false);
  }, [flashCopiedRow, flashCopiedLink, flashShared]);

  const built = useMemo(() => {
    if (!year || state.amount <= 0) return null;
    return build({
      year,
      amount: state.amount,
      surcharge: state.surcharge,
      lens: state.lens,
      headId: state.headId,
      subIndex: state.subIndex,
    });
  }, [year, state.amount, state.surcharge, state.lens, state.headId, state.subIndex]);

  const yearStub = summary.years.find((y) => y.id === state.year) ?? summary.years[0];

  // Independent of `built` on purpose: this is a rough estimate against public
  // filing data, not part of the audited dataset view model, and the two
  // should stay visibly separate rather than mixed into one object.
  const rankInfo = useMemo(() => (state.amount > 0 ? rank(state.amount) : null), [state.amount]);

  // A copied row link points at the row where the icon sits: same screen, same
  // depth, that row highlighted. Opening a row is what the row body and "Go
  // deeper" are for, so `sub` is never written from here.
  const copyRow = useCallback(
    (rowId: string, target: LinkTarget) => {
      void copyText(currentUrl(state, target));
      flashCopiedRow(rowId);
    },
    [state, flashCopiedRow]
  );

  const shareNative = useCallback(() => {
    if (!built) return;
    const url = currentUrl(state);
    const text = `${built.card.kicker}. ${built.card.big} ${built.card.sub}`;
    const fallback = () => {
      void copyText(`${text} ${url}`);
      flashShared(true);
    };
    const canShare = typeof navigator.share === "function" && window.isSecureContext;
    if (!canShare) return fallback();
    navigator.share({ title: "Where is my tax money?", text, url }).catch(fallback);
  }, [built, state, flashShared]);

  const canShare =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof window !== "undefined" &&
    window.isSecureContext;

  const showLoading = state.amount > 0 && !built && !loadError;

  return (
    <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", background: "var(--color-bg)", fontFamily: "var(--font-body)", color: "var(--color-text)" }}>
      <div style={{ width: "100%", maxWidth: 1120, minHeight: "100vh", background: "var(--color-bg)", display: "flex", flexDirection: "column", overflowX: "clip" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "16px clamp(22px, 4vw, 48px) 0", flex: "none" }}>
          <button type="button" onClick={() => go("home", null)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: 0, padding: "11px 0", minHeight: 44, cursor: "pointer", font: "inherit", color: "var(--color-text)" }}>
            <LogoMark />
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em" }}>{SITE_NAME}</span>
          </button>
          <button type="button" onClick={() => setState((s) => ({ ...s, screen: "about", back: s.screen }))} className="link-btn" style={{ background: "none", border: 0, padding: "11px 4px", minHeight: 44, cursor: "pointer", font: "inherit", fontSize: 13, color: "var(--color-accent-700)", textDecoration: "underline", textUnderlineOffset: 3 }}>
            Method
          </button>
        </div>

        {state.screen === "home" ? (
          <Home summary={summary} onStart={() => go("input", null)} />
        ) : null}

        {state.screen === "input" ? (
          <AmountInput
            amountStr={state.amountStr}
            amount={state.amount}
            surcharge={state.surcharge}
            year={state.year}
            years={summary.years}
            onAmount={(raw) => {
              const n = parseAmount(raw);
              setState((s) => ({ ...s, amount: n, amountStr: n ? n.toLocaleString("en-IN") : "" }));
            }}
            onSurcharge={(value) => setState((s) => ({ ...s, surcharge: value }))}
            onYear={(id) => setState((s) => ({ ...s, year: id }))}
            onSubmit={() => state.amount > 0 && go("result", null)}
          />
        ) : null}

        {loadError && state.screen !== "home" && state.screen !== "input" ? (
          <div style={{ flex: 1, width: "100%", maxWidth: 560, marginInline: "auto", padding: "34px clamp(22px, 4vw, 48px)" }}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28 }}>The figures did not load</h2>
            <p style={{ fontSize: 15, lineHeight: 1.5, color: "var(--color-neutral-800)" }}>{loadError}</p>
            <button type="button" onClick={() => setState((s) => ({ ...s }))} className="chip" style={{ border: "1px solid var(--color-divider)", background: "none", borderRadius: 999, padding: "12px 18px", minHeight: 44, font: "inherit", fontSize: 14, cursor: "pointer" }}>
              Try again
            </button>
          </div>
        ) : null}

        {showLoading ? (
          <div style={{ flex: 1, padding: "34px clamp(22px, 4vw, 48px)", color: "var(--color-neutral-700)", fontSize: 14 }}>
            Loading the {yearStub.label} figures…
          </div>
        ) : null}

        {built && year && state.screen === "result" ? (
          <Result
            built={built}
            amount={state.amount}
            yearLabel={yearStub.label}
            lens={state.lens}
            copiedRow={copiedRow}
            focusId={state.focusId}
            rank={rankInfo}
            onLens={(lens) => setState((s) => ({ ...s, lens, focusId: null }))}
            onEdit={() => go("input", null)}
            onOpen={(id) => setState((s) => ({ ...s, screen: "detail", headId: id, subIndex: null, focusId: null }))}
            onCopyRow={(id) => copyRow(id, { headId: null, subIndex: null, focusId: id })}
            onShare={() => go("share")}
          />
        ) : null}

        {built && year && state.screen === "detail" && built.head ? (
          <Detail
            built={built}
            backLabel={state.subIndex !== null ? `← ${built.head.parentLabel ?? "Back"}` : "← All of it"}
            copiedRow={copiedRow}
            focusId={state.focusId}
            onBack={() =>
              state.subIndex !== null
                ? setState((s) => ({ ...s, subIndex: null, focusId: null }))
                : go("result", null)
            }
            onOpenSub={(index) => setState((s) => ({ ...s, subIndex: index, focusId: null }))}
            onCopyRow={(id) => copyRow(id, { focusId: id })}
            onShare={() => go("share")}
          />
        ) : null}

        {/* A detail screen whose `at` no longer resolves: a stale link, a renamed
            head, or a year that does not carry that line. Land at the top rather
            than showing an error the reader cannot act on. */}
        {built && state.screen === "detail" && !built.head ? (
          <Result
            built={built}
            amount={state.amount}
            yearLabel={yearStub.label}
            lens={state.lens}
            copiedRow={copiedRow}
            focusId={state.focusId}
            rank={rankInfo}
            onLens={(lens) => setState((s) => ({ ...s, lens, focusId: null }))}
            onEdit={() => go("input", null)}
            onOpen={(id) => setState((s) => ({ ...s, screen: "detail", headId: id, subIndex: null }))}
            onCopyRow={(id) => copyRow(id, { headId: null, subIndex: null, focusId: id })}
            onShare={() => go("share")}
          />
        ) : null}

        {built && state.screen === "share" ? (
          <Share
            card={built.card}
            yearLabel={yearStub.label}
            canShare={canShare}
            shared={shared}
            copied={copiedLink}
            onBack={() => go(state.headId ? "detail" : "result")}
            onShare={shareNative}
            onCopyLink={() => {
              void copyText(currentUrl(state));
              flashCopiedLink(true);
            }}
          />
        ) : null}

        {state.screen === "about" ? (
          <Method
            yearLabel={yearStub.label}
            yearTag={yearStub.tag}
            divisiblePoolPercent={year?.divisiblePoolPercent ?? 41}
            awardLabel={year?.awardLabel ?? null}
            onBack={() => setState((s) => ({ ...s, screen: s.back }))}
          />
        ) : null}

        {state.screen === "feedback" ? (
          <Feedback onBack={() => setState((s) => ({ ...s, screen: s.back }))} />
        ) : null}

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px", padding: "18px clamp(22px, 4vw, 48px) 24px", borderTop: "1px solid var(--color-divider)", marginTop: "auto" }}>
          {hasRepo() ? (
            <a href={REPO_URL} target="_blank" rel="noopener" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600 }}>
              <GitHubIcon />
              Code and data on GitHub
            </a>
          ) : null}
          {hasRepo() ? (
            <span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>
              A star there helps people find it.
            </span>
          ) : null}
          <button type="button" onClick={() => setState((s) => ({ ...s, screen: "feedback", back: s.screen }))} className="link-btn" style={{ background: "none", border: 0, padding: "6px 0", minHeight: 44, cursor: "pointer", font: "inherit", fontSize: 13, color: "var(--color-accent-700)", textDecoration: "underline", textUnderlineOffset: 3 }}>
            Report a problem
          </button>
          <span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>
            {state.screen === "home" || state.screen === "input"
              ? `Government budget figures, ${summary.yearRange} · Ministry of Finance`
              : `Government budget ${yearStub.label} · ${yearStub.tag} · Ministry of Finance`}
          </span>
        </div>
      </div>
    </div>
  );
}
