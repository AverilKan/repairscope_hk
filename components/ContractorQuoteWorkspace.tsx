"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CONTRACTOR_CAPABILITY_STORAGE_KEY,
  isContractorQuoteWorkspaceSession,
  type ContractorQuoteWorkspaceSession,
} from "@/domain/contractorAuth";

export function ContractorQuoteWorkspace() {
  const [session, setSession] =
    useState<ContractorQuoteWorkspaceSession | null>();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = sessionStorage.getItem(CONTRACTOR_CAPABILITY_STORAGE_KEY);
      if (!stored) {
        setSession(null);
        return;
      }
      try {
        const parsed: unknown = JSON.parse(stored);
        setSession(isContractorQuoteWorkspaceSession(parsed) ? parsed : null);
      } catch {
        setSession(null);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (session === undefined) {
    return (
      <main className="contractor-workspace contractor-workspace--loading">
        <p>Checking the mock account match…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="contractor-workspace">
        <section className="contractor-workspace__gate">
          <p className="eyebrow">Contractor workspace</p>
          <h1>Account match required</h1>
          <p>
            Open the quote through its contractor invitation, then choose
            <strong> Manage my quotes</strong>. A query string or account-type
            selection cannot grant contractor access.
          </p>
          <Link className="button" href="/contractor/respond/demo-token">
            Return to invitation
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="contractor-workspace">
      <header className="contractor-workspace__header">
        <div>
          <p className="eyebrow">Contractor quote workspace</p>
          <h1>Submitted quotes</h1>
          <p>
            {session.businessName} · {session.capability.verifiedEmail}
          </p>
        </div>
        <span className="status-pill status-pill--good">Mock access confirmed</span>
      </header>

      <aside className="contractor-workspace__notice">
        <strong>Frontend prototype</strong>
        <p>
          This list is held in this browser session only. Clerk authentication,
          invitation validation and backend authorisation are not implemented.
        </p>
      </aside>

      <section aria-labelledby="submitted-quotes-heading">
        <div className="contractor-workspace__section-heading">
          <div>
            <p className="eyebrow">Quotes</p>
            <h2 id="submitted-quotes-heading">Your submitted responses</h2>
          </div>
          <span>{session.capability.attachedQuoteIds.length} submitted</span>
        </div>
        <div className="contractor-quote-list">
          {session.capability.attachedQuoteIds.map((quoteId) => (
            <article className="contractor-quote-card" key={quoteId}>
              <div>
                <p className="eyebrow">Electrical repair · SE15</p>
                <h3>Kitchen socket fault</h3>
                <p>Reference {quoteId}</p>
              </div>
              <div className="contractor-quote-card__status">
                <span className="status-pill status-pill--good">Submitted</span>
                <p>Awaiting landlord review</p>
              </div>
              <Link
                className="button button--secondary"
                href="/contractor/respond/demo-token"
              >
                View quote
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
