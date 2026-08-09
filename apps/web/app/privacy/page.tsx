import { BackLink, PageIntro, SiteShell } from "@/components/SiteShell";

// Pilot-stage privacy notice. Deliberately makes no claims this repo can't
// back up: no invented company registration details, postal address, legal
// entity name, retention periods, or third-party processor names. See
// docs/PUBLIC_INGESTION_LAUNCH.md for what data this describes.
export default function PrivacyPage() {
  return (
    <SiteShell>
      <main className="content-page">
        <BackLink href="/" label="RepairScope home" />
        <PageIntro
          eyebrow="Privacy"
          title="How RepairScope handles your information"
          description="This is a pilot service. This notice explains what we collect through the repair intake form and why."
        />

        <section>
          <h2>What we collect</h2>
          <p>When you use the public repair intake form, we collect:</p>
          <ul>
            <li>
              The repair description you give us, and your answers to the
              follow-up questions (property area, symptoms, timing, access,
              and whether you have supporting evidence such as photos).
            </li>
            <li>Your property postcode and, if you provide it, address.</li>
            <li>
              Your name, email address and phone number, and your preferred
              way to be contacted.
            </li>
            <li>
              Any notes you add about evidence you have available, and any
              additional context you give us.
            </li>
          </ul>
          <p>
            Your answers are used to generate a structured repair brief,
            which is stored alongside your original answers and contact
            details.
          </p>
        </section>

        <section>
          <h2>Why we collect it</h2>
          <p>
            We use this information to understand the repair you&apos;ve
            reported, decide whether RepairScope can help progress it, and
            contact you about your submission. Submitting the form does not
            create an account and does not require one.
          </p>
        </section>

        <section>
          <h2>Who we share it with</h2>
          <p>
            If you consent to it in the submission form, and we decide to
            pursue your repair, relevant information from your brief may be
            shared with contractors we invite to respond — only as needed to
            progress that specific repair. We do not sell your information.
          </p>
        </section>

        <section>
          <h2>Correction, deletion or questions</h2>
          <p>
            If you want to correct, update, or ask us to delete the
            information you&apos;ve submitted, contact us at{" "}
            <a href="mailto:hello@repairscope.co.uk">
              hello@repairscope.co.uk
            </a>
            .
          </p>
        </section>

        <p className="field-help">
          This is early, pilot-stage wording, not a final legal policy. It
          will be reviewed and expanded as the service grows.
        </p>
      </main>
    </SiteShell>
  );
}
