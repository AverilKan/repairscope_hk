"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useLanguage } from "./LanguageContext";

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
  // SiteShell renders for every surface, but only "landlord" is ever
  // reached inside LanguageProvider (see LandlordApp) — public/contractor/
  // operator stay English-only for now (full marketing/legal-page
  // bilingual coverage is explicitly out of scope for this rework; only
  // the shell pieces the questionnaire itself sits inside are localised
  // here).
  const { lang } = useLanguage();
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
          {surface === "public"
            ? "Describe · Source · Compare · Choose"
            : surface === "landlord"
              ? (lang === "zh" ? "業主檢視" : "Landlord view")
              : `${surface} view`}
        </div>
        <nav className="site-nav" aria-label="Primary navigation">
          {surface === "public" && (
            <>
              <Link href="/#how-it-works">How it works</Link>
              <Link href="/#for-landlords">For landlords</Link>
              <Link href="/#for-contractors">For contractors</Link>
              <Link href="/#faqs">FAQs</Link>
            </>
          )}
          {surface === "landlord" && (
            <Link href="/landlord/repairs">{lang === "zh" ? "我嘅維修" : "My repairs"}</Link>
          )}
          {surface !== "public" && surface !== "contractor" && surface !== "landlord" && (
            <Link href="/landlord/repairs">Repair workspace</Link>
          )}
          {surface !== "public" && (
            <Link href="/contractor/respond/demo-token">
              Contractor invitation
            </Link>
          )}
          {surface === "public" && (
            <Link className="button button--small" href="/landlord/repairs/new">
              Submit a repair
            </Link>
          )}
          {surface === "landlord" && <LanguageToggle />}
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
          <p>
            One clear brief. Selected contractors. Comparable proposals. You
            choose.
          </p>
        </div>
        <nav className="site-footer__links" aria-label="Legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
        <p className="site-footer__note">
          Founding pilot · Significant, non-emergency repairs in England
        </p>
      </footer>
    </div>
  );
}

export function LanguageToggle() {
  const { lang, setLang } = useLanguage();
  return (
    <div className="lang-toggle" aria-label="Language">
      <button
        type="button"
        className={lang === "zh" ? "active" : ""}
        onClick={() => setLang("zh")}
      >
        繁
      </button>
      <span>/</span>
      <button
        type="button"
        className={lang === "en" ? "active" : ""}
        onClick={() => setLang("en")}
      >
        EN
      </button>
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
