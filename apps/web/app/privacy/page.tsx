import { BackLink, PageIntro, SiteShell } from "@/components/SiteShell";

// Pilot-stage privacy notice, structured to cover what the ICO expects a
// privacy notice to explain (controller, purposes, lawful basis, sharing,
// retention criteria, rights, complaints) without inventing facts this repo
// can't back up. Two placeholders are deliberately left unfilled — the
// controller's legal/trading name and a firm retention period — see the
// completion report for what's still needed from the owner before this is
// the real public notice. See docs/PUBLIC_INGESTION_LAUNCH.md for what data
// this describes.
export default function PrivacyPage() {
  return (
    <SiteShell>
      <main className="content-page">
        <BackLink href="/" label="RepairScope home" />
        <PageIntro
          eyebrow="Privacy"
          title="How RepairScope handles your information"
          description="This notice explains what we collect through the repair intake form, why, and what rights you have over it."
        />

        <section>
          <h2>Who is responsible for this information</h2>
          <p>
            RepairScope is operated by{" "}
            <strong>[data controller name to be confirmed]</strong>. We will
            update this notice with our confirmed legal or trading name
            before inviting real submissions.
          </p>
        </section>

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
          <h2>Why we use it, and our lawful basis</h2>
          <p>
            We use this information to understand the repair you&apos;ve
            reported, decide whether RepairScope can help progress it, and
            contact you about your submission. Submitting the form does not
            create an account and does not require one.
          </p>
          <p>
            Our lawful basis for contacting you about your submission is your
            <strong> consent</strong>, given when you tick &ldquo;I consent to
            RepairScope contacting me about this submission&rdquo; before
            submitting. Sharing your brief with a contractor relies
            separately on the optional consent you give for that, described
            below. You can withdraw consent at any time — see &ldquo;Your
            rights&rdquo; below.
          </p>
        </section>

        <section>
          <h2>Who we share it with</h2>
          <p>
            If you consent to it in the submission form, and we decide to
            pursue your repair, relevant information from your brief may be
            shared with contractors we invite to respond — only as needed to
            progress that specific repair. We do not sell your information,
            and we do not share it with anyone else.
          </p>
        </section>

        <section>
          <h2>How long we keep it</h2>
          <p>
            We are running a small pilot and have not yet finalised a fixed
            retention schedule. In general, we keep your submission for as
            long as needed to review it, contact you about it, and handle any
            reasonable follow-up afterwards. If you&apos;d like your
            information deleted sooner, contact us and we will do so unless
            we have a good reason to keep it (for example, an ongoing query
            you&apos;ve raised with us).
          </p>
        </section>

        <section>
          <h2>Your rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>ask what information we hold about you;</li>
            <li>ask us to correct information that&apos;s inaccurate;</li>
            <li>ask us to delete your information;</li>
            <li>object to how we&apos;re using your information;</li>
            <li>withdraw your consent at any time.</li>
          </ul>
          <p>
            To exercise any of these, contact us using the details below. You
            also have the right to raise a concern with the UK Information
            Commissioner&apos;s Office (ICO) at{" "}
            <a
              href="https://ico.org.uk"
              target="_blank"
              rel="noreferrer noopener"
            >
              ico.org.uk
            </a>{" "}
            if you&apos;re unhappy with how we&apos;ve handled your
            information.
          </p>
        </section>

        <section>
          <h2>Contact us</h2>
          <p>
            For correction, deletion requests, or any question about this
            notice, contact us at{" "}
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
