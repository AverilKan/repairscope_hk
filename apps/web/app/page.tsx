import Link from "next/link";
import { SiteShell, StatusPill } from "@/components/SiteShell";

export default function Home() {
  return (
    <SiteShell>
      <main>
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero__copy">
            <p className="eyebrow">Founding pilot · Free for landlords</p>
            <h1 id="home-title">
              Got a significant repair at your rental property?
            </h1>
            <p className="home-hero__lead">
              Tell us what&apos;s gone wrong once.
            </p>
            <p>
              RepairScope creates a clear contractor brief, approaches
              suitable independent contractors, and organises their responses
              so you can understand what each is proposing before you choose.
            </p>
            <div className="home-hero__actions">
              <Link className="button" href="/landlord/repairs/new">
                Submit a repair →
              </Link>
            </div>
            <div className="home-hero__notes">
              <p>
                Already have a quote from your agent or contractor? Add it to
                the repair and we&apos;ll include it in the comparison.
              </p>
              <p>
                Significant, non-emergency repairs in England. Every
                founding-pilot repair is reviewed manually before contractors
                are contacted.
              </p>
            </div>
            <div className="trust-line" aria-label="Product principles">
              <span>One clear brief</span>
              <span>Selected contractors</span>
              <span>Comparable proposals</span>
              <span>You choose</span>
            </div>
          </div>

          <div className="home-ledger" aria-label="Illustrative repair journey">
            <div className="home-ledger__header">
              <div>
                <span>Repair</span>
                <strong>Private repair brief</strong>
              </div>
              <StatusPill tone="good">Ready to source</StatusPill>
            </div>
            <div className="home-ledger__problem">
              <span className="scope-mark">01</span>
              <div>
                <p>Water entering around chimney</p>
                <strong>Cause needs investigation</strong>
              </div>
            </div>
            <div className="home-ledger__rows">
              <article>
                <div>
                  <span className="proposal-initials">BR</span>
                  <div>
                    <strong>Clear repair brief</strong>
                    <small>Evidence and access organised</small>
                  </div>
                </div>
                <StatusPill tone="good">Landlord reviewed</StatusPill>
              </article>
              <article>
                <div>
                  <span className="proposal-initials">SC</span>
                  <div>
                    <strong>Suitable contractors</strong>
                    <small>Selected for the repair and area</small>
                  </div>
                </div>
                <StatusPill tone="neutral">Sourcing</StatusPill>
              </article>
              <article>
                <div>
                  <span className="proposal-initials">CP</span>
                  <div>
                    <strong>Comparable proposals</strong>
                    <small>Scope and terms shown clearly</small>
                  </div>
                </div>
                <StatusPill tone="ink">You choose</StatusPill>
              </article>
            </div>
            <div className="home-ledger__insight">
              <span aria-hidden="true">!</span>
              <div>
                <strong>Different approaches made visible</strong>
                <small>
                  Understand what each contractor is proposing before you
                  appoint anyone.
                </small>
              </div>
            </div>
          </div>
        </section>

        <section className="home-problem">
          <div className="home-story-grid">
            <div>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">The problem</p>
                  <h2>Finding a contractor is only half the problem.</h2>
                </div>
              </div>
              <p>
                A tenant reports a leak. Or a recurring drainage issue. Or
                water coming through the roof.
              </p>
              <p>
                You may be managing the property from another city. Your
                letting agent may have sent you one contractor&apos;s
                recommendation. Or you may simply have no reliable trades in
                the area.
              </p>
              <p>You start calling around. Then the answers are different.</p>
              <p>
                One contractor wants to repair it. Another wants to investigate
                first. Another recommends replacing something completely.
              </p>
            </div>
            <aside className="home-question-card">
              <p className="eyebrow">The questions that matter</p>
              <ul>
                <li>Are they actually quoting for the same work?</li>
                <li>Has anyone identified the underlying problem?</li>
                <li>What is included — and what could become an extra?</li>
                <li>Do I need another opinion?</li>
                <li>Which contractor should I instruct?</li>
              </ul>
              <p>
                <strong>RepairScope gives that process structure.</strong>
              </p>
            </aside>
          </div>
        </section>

        <section className="home-principles" id="how-it-works">
          <div className="section-heading">
            <div>
              <p className="eyebrow">How it works</p>
              <h2>One repair. One organised process.</h2>
            </div>
          </div>
          <div className="principle-grid">
            <article>
              <span>01</span>
              <h3>Tell us what&apos;s happened</h3>
              <p>
                Describe the problem, add the property postcode and add any
                useful photos, videos, reports or messages from the tenant.
                You do not need to already have a contractor or quote.
              </p>
            </article>
            <article>
              <span>02</span>
              <h3>We turn it into a contractor-ready brief</h3>
              <p>
                RepairScope organises the information into a clearer repair
                brief so contractors can understand the property, problem,
                evidence, access requirements and what needs investigating.
                You review the brief before it is shared.
              </p>
            </article>
            <article>
              <span>03</span>
              <h3>We approach suitable contractors</h3>
              <p>
                For repairs accepted into the founding pilot, we look for
                relevant independent contractors who cover the property
                area. Contractors can submit a proposal, request an
                inspection, ask a question, or decline. We don&apos;t send
                your repair indiscriminately to a large mailing list.
              </p>
            </article>
            <article>
              <span>04</span>
              <h3>Understand the proposals before you choose</h3>
              <p>
                RepairScope brings the responses together and highlights
                important differences — proposed work, assumptions,
                inclusions, exclusions, likely variations, availability and
                guarantees. Where contractors recommend different approaches,
                we make that clear rather than assuming the cheapest number
                is automatically the best option. The final decision is
                always yours.
              </p>
            </article>
          </div>
        </section>

        <section className="home-mid-cta home-mid-cta--band">
          <h2>Have a repair you need help with now?</h2>
          <p>
            You don&apos;t need to know which trade you need. Tell us
            what&apos;s happened and we&apos;ll review whether the repair is
            suitable for the founding pilot.
          </p>
          <Link className="button" href="/landlord/repairs/new">
            Submit a repair →
          </Link>
          <p className="field-help">
            No charge to landlords during the founding pilot.
          </p>
        </section>

        <section className="home-eligibility" id="for-landlords">
          <div className="home-eligibility-grid">
            <div>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Repair eligibility</p>
                  <h2>What kind of repairs are we looking for?</h2>
                </div>
              </div>
              <p>
                RepairScope is currently designed for significant,
                non-emergency repairs where finding and comparing suitable
                contractors is worth the effort. Good examples include:
              </p>
              <ul>
                <li>roof leaks and water ingress;</li>
                <li>recurring or structural drainage problems;</li>
                <li>significant leaks where the cause is unclear;</li>
                <li>windows and external doors;</li>
                <li>
                  larger remedial works where contractors may propose
                  different solutions.
                </li>
              </ul>
              <p>
                We also review other significant repair types individually.
              </p>
            </div>
            <aside className="home-warning-card">
              <p className="eyebrow">Important</p>
              <h3>RepairScope is not an emergency call-out service.</h3>
              <p>
                If there is an immediate risk to somebody&apos;s safety,
                uncontrolled water, sewage, gas, dangerous electrics, a
                security emergency or another issue requiring urgent
                attendance, arrange appropriate emergency assistance rather
                than wait for the RepairScope comparison process.
              </p>
              <p>
                For small, straightforward jobs, we may also tell you that
                obtaining several proposals is unlikely to be worth the delay.
              </p>
            </aside>
          </div>
        </section>

        <div className="home-card-grid">
          <section className="home-remote">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Managing remotely</p>
              <h2>Especially useful when you can&apos;t be there yourself.</h2>
            </div>
          </div>
          <p>
            Managing a repair becomes harder when the property is nowhere
            near where you live. You may be relying on:
          </p>
          <ul>
            <li>the tenant&apos;s description;</li>
            <li>photographs from a letting agent;</li>
            <li>a contractor you&apos;ve never used;</li>
            <li>a short quote with little explanation.</li>
          </ul>
          <p>
            RepairScope gives you one place to organise the evidence,
            contractor responses and questions so you can make the decision
            remotely.
          </p>
          </section>

          <section className="home-existing-quote">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Already have a quote?</p>
              <h2>Already been sent a repair quote?</h2>
            </div>
          </div>
          <p>
            Upload it. You can include proposals from your letting agent,
            your own contractor, or contractors introduced by RepairScope —
            they can all form part of the same repair.
          </p>
          <p>
            The aim is not simply to find a lower number. It is to
            understand whether the contractors are actually proposing
            equivalent work.
          </p>
          </section>
        </div>

        <section className="home-example">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Example</p>
              <h2>
                £1,800 vs £3,400 doesn&apos;t necessarily mean one
                contractor is expensive.
              </h2>
            </div>
          </div>
          <p>
            Imagine two proposals for water entering around a chimney.
          </p>
          <div className="home-example__grid">
            <article>
              <p className="eyebrow">Contractor A — £1,800</p>
              <p>Repair internal water damage and carry out local sealing.</p>
            </article>
            <article>
              <p className="eyebrow">Contractor B — £3,400</p>
              <p>
                Investigate the flashing and roof junction, repair the
                source of the ingress, then complete internal making-good.
              </p>
            </article>
          </div>
          <p>
            Those are not necessarily competing prices for the same repair.
            They may be different scopes. RepairScope is designed to make
            differences like that visible before you instruct the work.
          </p>
          <p className="field-help">
            Example for illustration only. RepairScope does not determine
            technical correctness or guarantee that a contractor&apos;s
            diagnosis is accurate.
          </p>
        </section>

        <div className="home-card-grid home-card-grid--trust">
          <section className="home-founding-pilot">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Founding pilot</p>
              <h2>Why is the landlord service currently free?</h2>
            </div>
          </div>
          <p>
            We&apos;re launching RepairScope with a small number of founding
            repair cases. Our goal is simple: take a real landlord repair,
            source suitable options, make the decision easier, and prove
            that the service is worth using again.
          </p>
          <p>During the founding pilot, there is no charge to the landlord.</p>
          <p>
            Where a contractor introduced by RepairScope is selected and the
            work proceeds, RepairScope may receive a fixed introduction fee
            from that contractor. Contractors cannot pay for a better
            ranking or recommendation.
          </p>
          <p>You remain free to:</p>
          <ul>
            <li>choose an introduced contractor;</li>
            <li>use your own contractor;</li>
            <li>request further clarification;</li>
            <li>or appoint nobody.</li>
          </ul>
          </section>

          <section className="home-trust">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Independence</p>
              <h2>You stay in control.</h2>
            </div>
          </div>
          <p>
            RepairScope helps organise the decision. We don&apos;t make it
            for you. RepairScope does not perform the repair work.
            Contractors are independent businesses and contract directly
            with you.
          </p>
          <p>We do not:</p>
          <ul>
            <li>automatically award work;</li>
            <li>show contractors their competitors&apos; prices;</li>
            <li>rank contractors based on who pays us more;</li>
            <li>
              claim that AI can determine which technical diagnosis is
              correct.
            </li>
          </ul>
          <p>
            Where we show contractor checks or credentials, we explain what
            was checked and when.
          </p>
          </section>
        </div>

        <section className="home-contractors" id="for-contractors">
          <div className="home-contractors__inner">
            <div className="section-heading">
              <div>
                <p className="eyebrow">For contractors</p>
                <h2>Are you a contractor?</h2>
              </div>
            </div>
            <div>
              <p>
                RepairScope introduces selected contractors to real,
                structured property-repair opportunities. Before deciding
                whether to engage, you can see the relevant job information
                and location.
              </p>
              <p>
                There is no subscription required during the founding pilot,
                and no fee simply to receive or lose an opportunity. Where a
                success fee applies, it is agreed before you participate in
                that job.
              </p>
              <Link
                className="button button--secondary"
                href="/contractor/respond/demo-token"
              >
                Learn about contractor opportunities
              </Link>
            </div>
          </div>
        </section>

        <section className="home-faq" id="faqs">
          <div className="section-heading">
            <div>
              <p className="eyebrow">FAQs</p>
              <h2>Questions landlords ask us</h2>
            </div>
          </div>
          <div className="home-faq__list">
            <details>
              <summary>Do I need to already have a quote?</summary>
              <p>
                No. You can come to RepairScope at the start of the repair.
                Tell us what has happened and provide whatever evidence you
                have. If the case is accepted, we can begin sourcing
                suitable contractors. If you already have a quote, you can
                upload it too.
              </p>
            </details>
            <details>
              <summary>Is RepairScope a contractor?</summary>
              <p>
                No. RepairScope provides repair briefing, contractor
                sourcing and proposal-comparison support. The contractors
                who inspect, quote for and perform the work are independent
                businesses.
              </p>
            </details>
            <details>
              <summary>Do you choose the contractor for me?</summary>
              <p>
                No. We organise the information and help you understand the
                proposals. You choose who, if anyone, to instruct.
              </p>
            </details>
            <details>
              <summary>
                Will I always receive multiple fixed-price quotes?
              </summary>
              <p>
                No. Some repairs cannot responsibly be priced without an
                inspection or further investigation. A contractor may
                therefore request a site visit or propose an initial
                diagnostic inspection before providing a remedial price.
                RepairScope keeps that process organised as well.
              </p>
            </details>
            <details>
              <summary>How does RepairScope make money?</summary>
              <p>
                During the founding pilot, landlords are not charged for
                managed contractor sourcing. Where a contractor introduced
                by RepairScope is selected and the work proceeds, that
                contractor may pay us a fixed introduction fee agreed before
                they participated. A contractor cannot pay RepairScope to
                appear higher in your comparison.
              </p>
            </details>
            <details>
              <summary>Do you only operate in Watford?</summary>
              <p>
                No. During the founding pilot, we are reviewing suitable
                repairs across England. Because we are still building our
                contractor coverage, every repair is reviewed individually
                before we confirm that managed sourcing is available for
                that property and repair type.
              </p>
            </details>
            <details>
              <summary>What if my repair is urgent?</summary>
              <p>
                RepairScope is not an emergency call-out service. If the
                situation involves immediate danger, uncontrolled water,
                sewage, gas, unsafe electrics, loss of security or another
                urgent hazard, arrange appropriate immediate assistance.
              </p>
            </details>
          </div>
        </section>

        <section className="home-mid-cta">
          <h2>One repair is enough to get started.</h2>
          <p>
            Tell us what has happened. We&apos;ll review the repair,
            organise the information and let you know whether it is
            suitable for the founding pilot.
          </p>
          <Link className="button" href="/landlord/repairs/new">
            Submit a repair →
          </Link>
          <p className="field-help">
            Free for landlords during the founding pilot. Existing quote
            optional.
          </p>
        </section>
      </main>
    </SiteShell>
  );
}
