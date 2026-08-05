import Link from "next/link";
import { SiteShell, StatusPill } from "@/components/SiteShell";

export default function Home() {
  return (
    <SiteShell>
      <main>
        <section className="home-hero">
          <div className="home-hero__copy">
            <p className="eyebrow">RepairScope · Remote landlord procurement</p>
            <h1>
              Understand what each contractor is{" "}
              <em>actually proposing.</em>
            </h1>
            <p>
              Turn a tenant report into a neutral repair brief, collect
              independent proposals from any source, and clarify meaningful
              differences before you appoint anyone.
            </p>
            <div className="home-hero__actions">
              <Link className="button" href="/landlord/repairs/new">
                Start as a landlord →
              </Link>
              <Link
                className="button button--secondary"
                href="/contractor/respond/demo-token"
              >
                View contractor invitation
              </Link>
            </div>
            <div className="trust-line" aria-label="Product principles">
              <span>Neutral by design</span>
              <span>Private clarification</span>
              <span>No best-quote score</span>
            </div>
          </div>

          <div className="home-ledger" aria-label="Illustrative proposal comparison">
            <div className="home-ledger__header">
              <div>
                <span>Repair</span>
                <strong>Private repair</strong>
              </div>
              <StatusPill tone="good">Ready to compare</StatusPill>
            </div>
            <div className="home-ledger__problem">
              <span className="scope-mark">01</span>
              <div>
                <p>Bedroom ceiling water ingress</p>
                <strong>Source not confirmed</strong>
              </div>
            </div>
            <div className="home-ledger__rows">
              <article>
                <div>
                  <span className="proposal-initials">RP</span>
                  <div>
                    <strong>Repair contractor</strong>
                    <small>Internal making-good</small>
                  </div>
                </div>
                <StatusPill tone="attention">Visible damage only</StatusPill>
                <strong>Submitted price</strong>
              </article>
              <article>
                <div>
                  <span className="proposal-initials">NR</span>
                  <div>
                    <strong>Roofing contractor</strong>
                    <small>Inspect suspected source</small>
                  </div>
                </div>
                <StatusPill tone="neutral">Inspection required</StatusPill>
                <strong>Inspection terms</strong>
              </article>
              <article>
                <div>
                  <span className="proposal-initials">HS</span>
                  <div>
                    <strong>Harper & Sons</strong>
                    <small>Uploaded agent quote</small>
                  </div>
                </div>
                <StatusPill tone="attention">Terms missing</StatusPill>
                <strong>Submitted price</strong>
              </article>
            </div>
            <Link className="home-ledger__insight" href="/landlord/repairs">
              <span>!</span>
              <div>
                <strong>Different approaches detected</strong>
                <small>Internal damage and the suspected source are treated separately.</small>
              </div>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>

        <section className="home-principles">
          <div className="section-heading">
            <div>
              <p className="eyebrow">A clearer procurement record</p>
              <h2>From messy report to defined repair.</h2>
            </div>
            <p>
              RepairScope organises evidence and commercial terms. Contractors
              remain responsible for their own diagnosis.
            </p>
          </div>
          <div className="principle-grid">
            <article>
              <span>01</span>
              <h3>Establish the problem</h3>
              <p>
                Preserve the tenant’s report, gather category-specific facts and
                keep safety questions explicit.
              </p>
            </article>
            <article>
              <span>02</span>
              <h3>Normalise every proposal</h3>
              <p>
                Portal responses, PDFs and agent quotes become one source-aware
                proposal model.
              </p>
            </article>
            <article>
              <span>03</span>
              <h3>Clarify without leakage</h3>
              <p>
                Ask one contractor a neutral question without revealing another
                contractor’s identity, price or wording.
              </p>
            </article>
            <article>
              <span>04</span>
              <h3>Keep the record immutable</h3>
              <p>
                A changed scope or price creates Proposal v2 while the original
                remains visible.
              </p>
            </article>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
