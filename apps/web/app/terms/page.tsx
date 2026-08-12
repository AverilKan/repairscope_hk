"use client";

import Link from "next/link";
import { BackLink, PageIntro, SiteShell } from "@/components/SiteShell";
import { useLanguage } from "@/components/LanguageContext";

// Lean, founding-pilot-proportionate Terms page — deliberately narrow, per
// the product/legal approach this reflects: no invented company/entity
// identity, no liability caps, indemnities or mature marketplace rules.
// Traditional Chinese is the default language, matching the rest of the
// public shell (see components/LanguageContext.tsx) — this page is a
// client component specifically so it can share that same toggle, unlike
// the previous static English-only version. Privacy/PICS content is
// intentionally out of scope here — see app/privacy/page.tsx, a separate,
// still-unstarted legal slice this page only points to once.
const T = {
  zh: {
    eyebrow: "RepairScope 香港創始試用",
    title: "使用條款",
    back: "返回主頁",
    intro: [
      "使用 RepairScope，即表示你同意以下使用條款。",
      "RepairScope 現時正以香港創始試用形式測試服務。我哋希望幫物業業主及獲授權協助處理物業維修的人士整理維修資料、了解工程需要，並在合適的情況下協助尋找師傅及整理不同做法和報價。",
      "創始試用期間，RepairScope 向物業業主提供的服務目前不收費。",
    ],
    whatWeDo: {
      heading: "RepairScope 會做咩",
      bullets: [
        "接收同整理你提交嘅維修申請；",
        "由人手查看你提供嘅資料；",
        "如有需要，聯絡你了解更多詳情；",
        "協助整理成一份結構清晰嘅維修簡報；",
        "評估個案是否適合現階段嘅創始試用；",
        "對於獲接納嘅個案，協助搵可能合適嘅師傅；",
        "協助整理師傅嘅提問、建議做法同報價；",
        "令唔同做法之間嘅分別更易理解同比較。",
      ],
      principle: "RepairScope 協助整理成個過程，但本身唔會進行維修工程。",
    },
    submitting: {
      heading: "提交維修申請",
      p: [
        "提交維修申請只代表你希望 RepairScope 為你的個案進行初步檢視。",
        "提交申請並不代表 RepairScope 已接受個案，亦不保證我哋能夠找到合適師傅、取得報價或協助完成維修。",
        "如果個案適合創始試用，我哋會聯絡你確認下一步。",
      ],
    },
    yourInfo: {
      heading: "你提供的資料",
      p: [
        "請提供你所知範圍內準確嘅資料。你唔需要自己判斷成因——只需要話俾我哋知你實際觀察到嘅情況。",
        "如果你提供嘅資料涉及第三方（例如租客或其他住戶），請只提供處理呢次維修合理需要嘅資料，並且喺你有合理授權嘅情況下先至提供。",
        "RepairScope 可能會就你提供嘅資料進一步查詢。整理好嘅維修簡報會俾你檢視，你亦可以要求更正。",
      ],
      privacyPrefix: "RepairScope 點樣處理個人資料，會喺我哋嘅",
      privacyLinkText: "私隱政策",
      privacySuffix: "內解釋。",
    },
    contractors: {
      heading: "師傅及維修工程",
      p: [
        "RepairScope 本身並不進行維修工程。",
        "如果我哋協助你接觸師傅，有關師傅仍然是獨立提供服務的一方。",
        "在決定開工前，你應該直接同所選師傅確認最終工程範圍、價錢、未包括的項目、工期、付款安排、保養及其他重要條款。",
        "是否選擇任何師傅，以及是否進行工程，最終由你決定。",
        "除非另有明確說明，實際維修工程的協議由你與所選師傅直接訂立。",
      ],
    },
    quotations: {
      heading: "報價及工程比較",
      p: [
        "RepairScope 可能會將師傅提供嘅資料整理成較清晰嘅格式，並且標示唔同建議做法或範圍之間嘅分別，等你比較嗰陣更加清楚。",
        "師傅提供嘅報價同技術講法，源頭係嗰位師傅本身。RepairScope 將呢啲資料整理呈現，唔代表 RepairScope 本身成為承建商、測量師、工程師或者技術認證機構。",
        "喺指示師傅開工之前，你應該自己確認清楚重要細節。",
      ],
    },
    limitations: {
      heading: "創始試用的限制",
      bullets: [
        "每宗維修申請都會獲接納；",
        "一定有師傅願意跟進；",
        "你會收到任何特定數量嘅報價；",
        "你會取得最平嘅價錢；",
        "師傅嘅工作表現；",
        "完工時間；",
        "維修結果；",
        "師傅提供嘅資料完全無誤。",
      ],
      bulletsIntro: "RepairScope 唔保證：",
      careSkill: "RepairScope 會以合理謹慎及技能提供我哋本身嘅服務。",
    },
    responsibility: {
      heading: "責任",
      p: [
        "RepairScope 會以合理謹慎及技能提供我哋本身嘅服務。",
        "在法律容許的範圍內，RepairScope 不會為獨立師傅實際進行的工程、師傅自行提供而我們無法合理核實的資料，或超出 RepairScope 合理控制範圍的延誤或供應情況負責。",
        "本條款不會排除或限制任何根據適用法律不能合法排除或限制的責任。",
      ],
    },
    emergencies: {
      heading: "緊急情況",
      p: [
        "RepairScope 唔係緊急上門維修服務。",
        "如果人身安全或財產有即時危險，請喺適當情況下離開危險範圍，並聯絡相關緊急服務或大廈管理處，唔好等待 RepairScope 回覆。",
        "如有即時人身安全危險，可以撥打 999。",
      ],
    },
    pilot: {
      heading: "創始試用",
      p: [
        "呢個服務仍然處於測試階段。RepairScope 可能會因應情況調整、暫停或者結束創始試用，亦可能改變我哋接受嘅維修個案類型。",
        "如果呢類改變會影響一宗我哋已經接納嘅個案，我哋會通知你。",
        "呢份使用條款如有更新，會喺更新條款刊出當日開始適用於未來嘅使用，除非法律另有要求或者我哋另行同你協定。日後嘅服務版本可能有唔同嘅條款或收費安排。",
      ],
    },
    fees: {
      heading: "費用",
      p: [
        "創始試用期間，RepairScope 目前不向物業業主收取使用 RepairScope 服務的費用。",
        "如果將來收費模式有改變，我哋會在你需要支付任何費用之前清楚告知你。",
        "師傅就實際維修工程收取的費用並不是 RepairScope 的服務費。",
      ],
    },
    law: {
      heading: "適用法律",
      p: ["本使用條款受香港特別行政區法律管限。"],
    },
    lastUpdated: "最後更新：2026年8月12日",
  },
  en: {
    eyebrow: "RepairScope Hong Kong Founding Pilot",
    title: "Terms of Use",
    back: "Back to home",
    intro: [
      "By using RepairScope, you agree to these Terms of Use.",
      "RepairScope is currently being tested as a founding-pilot service in Hong Kong. We help property owners and people authorised to manage a property repair organise repair information, understand the problem and, where appropriate, source contractors and structure different approaches and quotations.",
      "The RepairScope service is currently free for property owners during the founding pilot.",
    ],
    whatWeDo: {
      heading: "What RepairScope does",
      bullets: [
        "receive and organise the repair request you submit;",
        "manually review the information you provide;",
        "contact you for clarification where needed;",
        "help prepare a structured repair brief;",
        "assess whether the case is suitable for the current founding pilot;",
        "for accepted cases, help identify contractors who may be suitable;",
        "help organise contractor questions, proposed approaches and quotations;",
        "make differences between approaches easier to understand and compare.",
      ],
      principle: "RepairScope helps organise the process. It does not itself carry out the repair.",
    },
    submitting: {
      heading: "Submitting a repair",
      p: [
        "Submitting a repair request asks RepairScope to review the case.",
        "Submission does not mean that RepairScope has accepted the repair and does not guarantee that we will find a suitable contractor, obtain quotations or manage the repair through to completion.",
        "If the case is suitable for the founding pilot, we will contact you about the next steps.",
      ],
    },
    yourInfo: {
      heading: "Information you provide",
      p: [
        "Please provide information that is accurate to the best of your knowledge. You do not need to diagnose the cause yourself — just tell us what you have actually observed.",
        "If the information you provide relates to someone else (for example a tenant or another occupant), please only provide what is reasonably necessary for the repair, and only where you are appropriately authorised to do so.",
        "RepairScope may ask you for clarification. The generated repair brief is shown to you for review, and you can ask for it to be corrected.",
      ],
      privacyPrefix: "How RepairScope handles personal data is explained in our",
      privacyLinkText: "Privacy Notice",
      privacySuffix: ".",
    },
    contractors: {
      heading: "Contractors and repair work",
      p: [
        "RepairScope does not itself perform the repair work.",
        "Where RepairScope helps you contact a contractor, that contractor remains an independent service provider.",
        "Before authorising work, you should confirm the final scope, price, exclusions, timing, payment arrangements, warranties and other important terms directly with the contractor you choose.",
        "The decision whether to select a contractor or proceed with the work remains yours.",
        "Unless expressly stated otherwise, the agreement for the actual repair work is between you and the contractor you select.",
      ],
    },
    quotations: {
      heading: "Quotations and comparisons",
      p: [
        "RepairScope may organise the information contractors provide into a clearer format, and highlight differences in proposed scope or approach so they are easier to compare.",
        "Quotations and technical statements come from the contractor who provides them. Organising this information does not make RepairScope the builder, surveyor, engineer or technical certifier.",
        "You should confirm important details yourself before instructing a contractor to begin work.",
      ],
    },
    limitations: {
      heading: "Founding-pilot limitations",
      bullets: [
        "that every repair request will be accepted;",
        "that a contractor will be willing to take on the case;",
        "that you will receive any particular number of quotations;",
        "that you will get the lowest price;",
        "a contractor's performance;",
        "completion times;",
        "the outcome of the repair;",
        "that information supplied by a contractor is error-free.",
      ],
      bulletsIntro: "RepairScope does not guarantee:",
      careSkill: "RepairScope will provide its own service with reasonable care and skill.",
    },
    responsibility: {
      heading: "Responsibility",
      p: [
        "RepairScope will provide its own service with reasonable care and skill.",
        "To the extent permitted by law, RepairScope is not responsible for repair work actually performed by an independent contractor, information independently supplied by a contractor that RepairScope could not reasonably verify, or delays and availability outside RepairScope's reasonable control.",
        "Nothing in these Terms excludes or limits liability that cannot lawfully be excluded or limited.",
      ],
    },
    emergencies: {
      heading: "Emergencies",
      p: [
        "RepairScope is not an emergency call-out service.",
        "If there is immediate danger to people or property, leave the danger area where appropriate and contact the relevant emergency service or building management — do not wait for RepairScope to respond.",
        "For immediate danger to personal safety, call 999.",
      ],
    },
    pilot: {
      heading: "Founding pilot",
      p: [
        "This service is still being tested. RepairScope may adjust, pause or end the founding pilot, and may change the types of repair cases it accepts.",
        "If such a change affects a case we have already accepted, we will let you know.",
        "Updates to these Terms apply prospectively, from the date the updated Terms are published, unless a change is required by law or separately agreed with you. Future versions of the service may have different terms or pricing.",
      ],
    },
    fees: {
      heading: "Fees",
      p: [
        "RepairScope currently does not charge property owners for using the RepairScope service during the founding pilot.",
        "If this changes in future, we will tell you clearly before you are required to pay any RepairScope fee.",
        "Charges made by a contractor for the actual repair work are not RepairScope service fees.",
      ],
    },
    law: {
      heading: "Applicable law",
      p: ["These Terms are governed by the laws of the Hong Kong Special Administrative Region."],
    },
    lastUpdated: "Last updated: 12 August 2026",
  },
} as const;

export default function TermsPage() {
  const { lang } = useLanguage();
  const c = T[lang];

  return (
    <SiteShell>
      <main className="content-page">
        <BackLink href="/" label={c.back} />
        <PageIntro eyebrow={c.eyebrow} title={c.title} />

        <section>
          {c.intro.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>

        <section>
          <h2>{c.whatWeDo.heading}</h2>
          <ul>
            {c.whatWeDo.bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>{c.whatWeDo.principle}</p>
        </section>

        <section>
          <h2>{c.submitting.heading}</h2>
          {c.submitting.p.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>

        <section>
          <h2>{c.yourInfo.heading}</h2>
          {c.yourInfo.p.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <p>
            {c.yourInfo.privacyPrefix} <Link href="/privacy">{c.yourInfo.privacyLinkText}</Link>
            {c.yourInfo.privacySuffix}
          </p>
        </section>

        <section>
          <h2>{c.contractors.heading}</h2>
          {c.contractors.p.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>

        <section>
          <h2>{c.quotations.heading}</h2>
          {c.quotations.p.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>

        <section>
          <h2>{c.limitations.heading}</h2>
          <p>{c.limitations.bulletsIntro}</p>
          <ul>
            {c.limitations.bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>{c.limitations.careSkill}</p>
        </section>

        <section>
          <h2>{c.responsibility.heading}</h2>
          {c.responsibility.p.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>

        <section>
          <h2>{c.emergencies.heading}</h2>
          {c.emergencies.p.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>

        <section>
          <h2>{c.pilot.heading}</h2>
          {c.pilot.p.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>

        <section>
          <h2>{c.fees.heading}</h2>
          {c.fees.p.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>

        <section>
          <h2>{c.law.heading}</h2>
          {c.law.p.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>

        <p className="field-help">{c.lastUpdated}</p>
      </main>
    </SiteShell>
  );
}
