"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
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
  // One shared LanguageProvider (mounted at the app root, see
  // app/layout.tsx) covers every surface now — public, landlord,
  // contractor and operator nav/footer all read the same lang state.
  // Full marketing/legal-page COPY bilingual coverage (the actual privacy/
  // terms body text, contractor/operator screens) remains its own,
  // separate workstream — this only makes the shared shell chrome
  // consistent.
  const { lang } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const publicCopy = lang === "zh"
    ? {
        how: "服務流程", repairs: "適合邊類維修", faq: "常見問題", cta: "開始維修申請",
        descriptor: "整理維修 · 物色師傅 · 比較報價 · 由你決定", menu: "開啟選單",
        pilot: "創始試用", privacy: "私隱政策", terms: "使用條款",
        footer: "為香港物業業主整理較大型、非緊急住宅維修。",
      }
    : {
        how: "How it works", repairs: "Repairs", faq: "FAQ", cta: "Start a repair",
        descriptor: "Organise · Source · Compare · You choose", menu: "Open menu",
        pilot: "Founding pilot", privacy: "Privacy", terms: "Terms",
        footer: "Helping Hong Kong property owners organise significant, non-emergency home repairs.",
      };
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
            ? publicCopy.descriptor
            : surface === "landlord"
              ? (lang === "zh" ? "業主檢視" : "Owner view")
              : `${surface} view`}
        </div>
        {surface === "public" && (
          <button
            className="mobile-menu-button"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="public-navigation"
            aria-label={publicCopy.menu}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
          </button>
        )}
        {/* Founding-pilot public/owner navigation deliberately has no path
            into the deferred Gate-B procurement flow (the "My repairs"
            list and everything downstream of it) or the contractor
            demo-token invitation — see components/LandlordApp.tsx's
            LandlordHome for the equivalent entry-screen change. Neither
            link is reintroduced here for "operator"/"contractor" surfaces
            either, since a real HK owner never reaches those surfaces from
            this shell. */}
        <nav
          id={surface === "public" ? "public-navigation" : undefined}
          className={`site-nav ${menuOpen ? "site-nav--open" : ""}`}
          aria-label="Primary navigation"
        >
          {surface === "public" && (
            <>
              <Link onClick={() => setMenuOpen(false)} href="/#how-it-works">{publicCopy.how}</Link>
              <Link onClick={() => setMenuOpen(false)} href="/#repairs">{publicCopy.repairs}</Link>
              <Link onClick={() => setMenuOpen(false)} href="/#faq">{publicCopy.faq}</Link>
            </>
          )}
          {surface === "public" && (
            <Link className="button button--small" href="/landlord/repairs/new">
              {publicCopy.cta}
            </Link>
          )}
          {(surface === "public" || surface === "landlord") && <LanguageToggle />}
        </nav>
      </header>
      {children}
      {surface !== "landlord" && (
        <footer className="site-footer">
          <div>
            <span className="wordmark wordmark--footer">
              <span className="wordmark__mark" aria-hidden="true">
                RS
              </span>
              <span>RepairScope</span>
            </span>
            <p>{publicCopy.footer}</p>
          </div>
          <nav className="site-footer__links" aria-label="Legal">
            <Link href="/privacy">{publicCopy.privacy}</Link>
            <Link href="/terms">{publicCopy.terms}</Link>
            <LanguageToggle />
          </nav>
          <p className="site-footer__note">
            {publicCopy.pilot} · {lang === "zh" ? "香港" : "Hong Kong"}
          </p>
        </footer>
      )}
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
