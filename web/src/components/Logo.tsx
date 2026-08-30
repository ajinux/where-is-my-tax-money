// The brand mark: a rupee sign whose downstroke splits into three, for money
// that leaves in several directions at once. Two sizes are drawn rather than
// scaled — the small one drops the dots, which turn to mud at 26px.

export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ flex: "none", display: "block" }}>
      <circle cx="50" cy="50" r="50" fill="var(--color-accent-500)" />
      <g stroke="var(--color-bg)" strokeWidth="10" strokeLinecap="round" fill="none">
        <path d="M36 30h28" />
        <path d="M36 43h28" />
        <path d="M59 30c0 11-9 13-18 13" />
        <path d="M45 43 L33 70" />
        <path d="M45 43 L50 70" />
        <path d="M45 43 L67 70" />
      </g>
    </svg>
  );
}

export function LogoMarkLarge({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ flex: "none", display: "block" }}>
      <circle cx="50" cy="50" r="50" fill="var(--color-accent-500)" />
      <g stroke="var(--color-bg)" strokeWidth="7" strokeLinecap="round" fill="none">
        <path d="M34 27h32" />
        <path d="M34 40h32" />
        <path d="M60 27c0 11-9 13-19 13" />
        <path d="M42 40 L34 56" />
        <path d="M42 40 L50 56" />
        <path d="M42 40 L66 56" />
      </g>
      <circle cx="34" cy="63" r="5.5" fill="var(--color-bg)" />
      <circle cx="50" cy="63" r="5.5" fill="var(--color-bg)" />
      <circle cx="66" cy="63" r="5.5" fill="var(--color-bg)" />
      <circle cx="42" cy="79" r="4" fill="var(--color-accent-2-400)" />
      <circle cx="58" cy="79" r="4" fill="var(--color-accent-2-400)" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function LinkIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.8 1.8" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.8-1.8" />
    </svg>
  );
}

export function ExternalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export function GitHubIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.9 1.2 1.9 1.2 1.1 1.9 2.9 1.3 3.6 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}
