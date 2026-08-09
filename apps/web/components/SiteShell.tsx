import Link from "next/link";
import type { ReactNode } from "react";

type Surface = "public" | "landlord" | "contractor" | "operator";

export function SiteShell({
  children,
  surface = "public",
  compact = false,
}: {
  children: ReactNode;
  surface?: Surface;
  compact?: boolean;
}) {
  return (
    <div className={`site-shell ${compact ? "site-shell--compact" : ""}`}>
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="RepairScope home">
          <span className="wordmark__mark" aria-hidden="true">
            RS
          </span>
          <span>RepairScope</span>
        </Link>
        <div className="surface-label" aria-label={`Current area: ${surface}`}>
          <span className="surface-label__dot" aria-hidden="true" />
          {surface === "public" ? "Repair procurement, clarified" : `${surface} view`}
        </div>
        <nav className="site-nav" aria-label="Primary navigation">
          {surface === "landlord" && (
            <Link href="/landlord/repairs">My repairs</Link>
          )}
          {surface !== "contractor" && (
            <Link href="/landlord/repairs">Repair workspace</Link>
          )}
          <Link href="/contractor/respond/demo-token">
            Contractor invitation
          </Link>
          {surface === "public" && (
            <Link className="button button--small" href="/landlord">
              Open landlord workspace
            </Link>
          )}
        </nav>
      </header>
      {children}
      <footer className="site-footer">
        <div>
          <span className="wordmark wordmark--footer">
            <span className="wordmark__mark" aria-hidden="true">
              RS
            </span>
            <span>RepairScope</span>
          </span>
          <p>Neutral repair briefs. Independent proposals. Private clarification.</p>
        </div>
        <nav className="site-footer__links" aria-label="Legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
        <p className="site-footer__note">
          Prototype data only · No real invitations, payments or contractor
          verification
        </p>
      </footer>
    </div>
  );
}

export function BackLink({ href, label = "Back" }: { href: string; label?: string }) {
  return (
    <Link className="back-link" href={href}>
      <span aria-hidden="true">←</span> {label}
    </Link>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "attention" | "ink";
}) {
  return <span className={`status-pill status-pill--${tone}`}>{children}</span>;
}

export function PageIntro({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="page-intro">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="page-intro__description">{description}</p>}
      </div>
      {aside && <div className="page-intro__aside">{aside}</div>}
    </div>
  );
}
