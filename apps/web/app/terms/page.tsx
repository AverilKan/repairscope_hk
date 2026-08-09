import { BackLink, PageIntro, SiteShell } from "@/components/SiteShell";

// Pilot-stage terms/service explanation. Deliberately narrow: what
// RepairScope is, what submitting does and doesn't mean, and where
// responsibility sits. No invented guarantees, SLAs, or legal entity
// details. See docs/PUBLIC_INGESTION_LAUNCH.md for the product decisions
// this reflects.
export default function TermsPage() {
  return (
    <SiteShell>
      <main className="content-page">
        <BackLink href="/" label="RepairScope home" />
        <PageIntro
          eyebrow="Terms"
          title="What RepairScope is, and what it isn't"
          description="A short explanation of the service, written for this pilot."
        />

        <section>
          <h2>What RepairScope does</h2>
          <p>
            RepairScope helps landlords turn a reported repair into a clear,
            neutral brief, and coordinates getting that repair looked at.
            RepairScope is not itself the contractor who carries out the
            repair work.
          </p>
        </section>

        <section>
          <h2>What submitting a repair means</h2>
          <p>
            Every submission is reviewed manually. Submitting a repair does
            not guarantee that RepairScope will pursue it, or that a
            contractor will be available or willing to take it on. We will
            contact you about the next appropriate step.
          </p>
        </section>

        <section>
          <h2>What the generated brief is</h2>
          <p>
            The brief RepairScope generates organises the information you
            reported into a clearer structure. It is not an authoritative
            diagnosis of the problem, and it does not confirm a technical
            cause. Any contractor who responds should state their own
            working diagnosis independently.
          </p>
        </section>

        <section>
          <h2>Who decides what happens next</h2>
          <p>
            You, as the landlord or authorised representative who submitted
            the repair, remain responsible for deciding whether to appoint
            any contractor and for managing that appointment.
          </p>
        </section>

        <section>
          <h2>Urgent or emergency issues</h2>
          <p>
            If a repair is urgent or an emergency, do not wait for
            RepairScope to respond — contact an appropriate emergency
            service or contractor directly first.
          </p>
        </section>

        <section>
          <h2>Questions</h2>
          <p>
            Contact us at{" "}
            <a href="mailto:hello@repairscope.co.uk">
              hello@repairscope.co.uk
            </a>
            .
          </p>
        </section>

        <p className="field-help">Last updated: 9 August 2026.</p>
      </main>
    </SiteShell>
  );
}
