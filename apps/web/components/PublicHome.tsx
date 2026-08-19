"use client";

import Link from "next/link";
import { SiteShell } from "./SiteShell";
import { useLanguage } from "./LanguageContext";

// HK founding-pilot public homepage — visual design/layout/copy direction
// transplanted from the approved Sites redesign export
// (repairscope-hk-redesign-source.zip), with one bounded Chinese-copy
// consistency pass: the "steps" first-row description originally read
// "用現有問卷講低你見到的情況" (leaks the internal "existing questionnaire"
// implementation detail, and mixes a more formal written-Chinese register
// into an otherwise conversational HK voice) — reworded to match the
// natural, conversational tone already established by the approved
// questionnaire copy itself.
const copy = {
  zh: {
    pilot: "創始試用 · 業主免費",
    title: "屋企有維修？\n唔使自己逐個師傅追住問。",
    lead: "你只需要一次過話俾我哋知發生咩事。",
    intro:
      "修理易幫你整理工程資料、搵合適師傅，再將唔同做法同報價整理好，等你清楚比較之後自己決定。",
    cta: "開始維修申請",
    ctaNote: "毋須先知道要搵邊一種師傅",
    deskLabel: "你的維修，由混亂變清晰",
    deskTitle: "維修處理概覽",
    deskStatus: "人手跟進",
    deskProblem: "浴室天花出現水漬",
    deskUnknown: "原因暫時未確定",
    deskSteps: ["資料已整理", "合適個案搵師傅", "做法及報價並列", "由業主決定"],
    howEyebrow: "服務流程",
    howTitle: "一次講清楚，之後由我哋幫你整理。",
    howIntro: "修理易不是師傅名錄。每宗申請都會先由真人查看，再決定合適的下一步。",
    steps: [
      ["話俾我哋知發生咩事", "毋須自己判斷工種。答幾條簡單問題，講低你見到嘅情況。"],
      ["修理易人手整理及檢查", "我哋會查看資料、整理工程重點，有需要時再向你了解。"],
      ["我哋幫你搵合適師傅", "適合而獲接納的個案，我哋會按維修需要物色相關師傅。"],
      ["整理做法同報價，俾你自己決定", "將不同範圍、方法及報價重點並列，最後選擇仍然由你作主。"],
    ],
    repairsEyebrow: "適合邊類維修",
    repairsTitle: "較大型、需要釐清做法的住宅維修。",
    repairsIntro:
      "創始試用主要處理非緊急、而且值得花時間整理及比較方案的住宅內部維修。",
    repairTypes: ["滲水 / 漏水", "防水問題", "去水 / 渠務問題", "水喉問題", "浴室維修", "其他較大型住宅內部維修"],
    unsureTitle: "唔肯定係咩問題都可以提交。",
    unsureText: "你描述見到、聽到或受到影響的情況就可以，我哋會協助整理。",
    evidence: "如果你有相片、影片、報告或現有報價，修理易之後可以喺檢視過程中向你收集相關資料。",
    whyEyebrow: "點解用修理易",
    whyTitle: "維修最難的，往往不是找到一個價錢。",
    values: [
      ["唔使逐個師傅重新解釋", "先把問題整理成一份清楚資料，減少每次由頭講起。"],
      ["報價唔係淨係睇價錢", "不同師傅可能建議不同範圍和方法；數字未必代表同一樣工程。"],
      ["幫你整理重點", "把包括甚麼、如何處理及有甚麼差異放在一起，較容易比較。"],
      ["最後決定仍然係你", "修理易協助整理選項，不會代你委任師傅。"],
    ],
    pilotEyebrow: "創始試用",
    pilotTitle: "少量個案，逐宗人手跟進。",
    pilotLead: "創始試用期間，物業業主免費使用修理易的維修整理及師傅物色服務。",
    pilotPoints: [
      "每份申請均由真人查看",
      "只接納數量有限、合適的維修個案",
      "如資料未清楚，我哋可能先聯絡你了解",
      "申請不會自動廣發給大量師傅",
    ],
    pilotNote: "提交申請不代表個案一定獲接納、一定有師傅可接、一定收到報價，亦不保證維修結果。",
    safetyTitle: "重要：修理易不是緊急維修服務",
    safetyText:
      "修理易適合較大型的非緊急維修協調。如果情況有即時危險，請先使用合適的緊急服務，唔好等修理易物色報價。",
    faqEyebrow: "常見問題",
    faqTitle: "提交前，你可能想知道。",
    faqs: [
      ["修理易收費嗎？", "創始試用期間，物業業主免費使用服務。"],
      ["咩類型維修可以提交？", "你可以提交較大型、非緊急的住宅維修，例如滲漏、防水、去水、水喉或浴室問題。其他個案亦可先提交，由我哋逐宗查看。"],
      ["我唔知道要搵咩師傅，可以嗎？", "可以。你毋須先判斷工種，只需描述發生咗咩事同受到咩影響。"],
      ["提交後會發生咩事？", "修理易會先人手查看及整理資料。如個案可能適合，我哋會聯絡你了解下一步；有需要時，師傅亦可能先要求視察或補充資料。"],
      ["會唔會即刻將資料傳俾好多師傅？", "不會。個案會先由人手查看，不會自動廣發。只有合適而獲接納嘅個案，先會按需要物色相關師傅。"],
      ["如果已經有報價，可以點做？", "照常提交維修並話俾我哋知你已經有報價。修理易可以喺其後嘅檢視過程中向你收集相關資料。"],
      ["修理易係緊急維修服務嗎？", "唔係。如果有即時危險，請先使用合適嘅緊急服務，唔好等修理易回覆或物色報價。"],
      ["我一定會收到報價嗎？", "唔一定。提交唔保證獲接納、師傅有空或者一定有報價。有啲情況亦可能需要先視察或調查。"],
    ],
    finalTitle: "有一宗維修，就可以開始。",
    finalText: "先話俾我哋知發生咩事。我哋會人手查看，再同你交代合適嘅下一步。",
  },
  en: {
    pilot: "Founding pilot · Free for property owners",
    title: "Got a repair?\nTell us what happened once.",
    lead: "You do not need to chase and re-explain the problem to contractors one by one.",
    intro:
      "SimpleFix helps organise the problem, find suitable contractors and structure their different approaches and quotations so you can compare them clearly before deciding.",
    cta: "Start a repair",
    ctaNote: "You do not need to know which trade you need",
    deskLabel: "From a messy repair to a clear process",
    deskTitle: "Repair overview",
    deskStatus: "Manually reviewed",
    deskProblem: "Water mark on bathroom ceiling",
    deskUnknown: "Cause not yet confirmed",
    deskSteps: ["Information organised", "Suitable cases sourced", "Approaches compared", "Owner decides"],
    howEyebrow: "How it works",
    howTitle: "Explain it once. We help organise what follows.",
    howIntro: "SimpleFix is not a contractor directory. Every submission is reviewed by a person before the next step is decided.",
    steps: [
      ["Tell us what happened", "You do not need to diagnose the trade. Answer a few simple questions to describe what you can see."],
      ["We manually review and organise it", "We check the information, structure the important points and contact you if anything needs clarifying."],
      ["We source suitable contractors", "For suitable cases accepted into the pilot, we look for contractors relevant to the repair."],
      ["Compare approaches and choose", "We organise differences in scope, method and quotations. The final decision remains yours."],
    ],
    repairsEyebrow: "Repairs",
    repairsTitle: "Significant home repairs where the right approach needs clarifying.",
    repairsIntro:
      "The founding pilot focuses on significant, non-emergency internal residential repairs where organising and comparing approaches is worthwhile.",
    repairTypes: ["Leaks / water ingress", "Waterproofing", "Drainage problems", "Plumbing problems", "Bathroom repairs", "Other significant internal home repairs"],
    unsureTitle: "Not sure what the problem is? You can still submit it.",
    unsureText: "Describe what you can see, hear or what has been affected. We will help organise the information.",
    evidence: "If you have photos, videos, reports or an existing quotation, SimpleFix can collect those details during the review process.",
    whyEyebrow: "Why SimpleFix",
    whyTitle: "The hardest part of a repair is rarely finding a number.",
    values: [
      ["Explain it once", "Start with one clear account of the problem instead of repeating it to every contractor."],
      ["A quotation is more than a price", "Contractors may propose different scopes and methods, so the numbers may not describe the same work."],
      ["See the important differences", "We structure what is included, how the work may be approached and where proposals differ."],
      ["You remain in control", "SimpleFix helps organise the options. We do not appoint a contractor for you."],
    ],
    pilotEyebrow: "Founding pilot",
    pilotTitle: "A small number of cases, handled personally.",
    pilotLead: "During the founding pilot, property owners use SimpleFix's repair-organising and contractor-sourcing service free of charge.",
    pilotPoints: [
      "Every submission is reviewed by a person",
      "Only a limited number of suitable repairs are accepted",
      "We may contact you to clarify the problem first",
      "Cases are not automatically broadcast to contractors",
    ],
    pilotNote: "Submitting does not guarantee acceptance, contractor availability, a quotation or a successful repair outcome.",
    safetyTitle: "Important: SimpleFix is not an emergency repair service",
    safetyText:
      "SimpleFix is for coordinating significant, non-emergency repairs. If there is immediate danger, use the appropriate emergency service rather than waiting for SimpleFix to source quotations.",
    faqEyebrow: "FAQ",
    faqTitle: "What you may want to know before submitting.",
    faqs: [
      ["Does SimpleFix charge property owners?", "No. Property owners use the service free of charge during the founding pilot."],
      ["What kinds of repairs can I submit?", "You can submit significant, non-emergency home repairs such as leaks, waterproofing, drainage, plumbing or bathroom problems. You can also submit another kind of case for individual review."],
      ["What if I do not know which contractor or trade I need?", "That is fine. You do not need to diagnose the trade; describe what happened and what has been affected."],
      ["What happens after I submit?", "SimpleFix manually reviews and organises the information first. If the case may be suitable, we will contact you about the next step. A contractor may need to inspect or ask questions before quoting."],
      ["Will my details be sent to lots of contractors immediately?", "No. Cases are reviewed manually and are not automatically broadcast. We only source relevant contractors for suitable cases accepted into the pilot."],
      ["What if I already have a quotation?", "Submit the repair and tell us you already have one. SimpleFix can collect the relevant details during the later review process."],
      ["Is SimpleFix an emergency repair service?", "No. If there is immediate danger, use the appropriate emergency service rather than waiting for SimpleFix to respond or source quotations."],
      ["Am I guaranteed to receive a quotation?", "No. Submission does not guarantee acceptance, contractor availability or a quotation. Some cases may also require an inspection or investigation first."],
    ],
    finalTitle: "One repair is enough to begin.",
    finalText: "Tell us what happened. We will review it personally and explain the appropriate next step.",
  },
} as const;

export function PublicHome() {
  const { lang } = useLanguage();
  const c = copy[lang];

  return (
    <SiteShell>
      <main className="rs-home">
        <section className="rs-hero" aria-labelledby="home-title">
          <div className="rs-hero__copy">
            <p className="rs-kicker"><span />{c.pilot}</p>
            <h1 id="home-title">{c.title}</h1>
            <p className="rs-hero__lead">{c.lead}</p>
            <p className="rs-hero__intro">{c.intro}</p>
            <div className="rs-hero__action">
              <Link className="button rs-primary-cta" href="/landlord/repairs/new">
                {c.cta}<span aria-hidden="true">→</span>
              </Link>
              <small>{c.ctaNote}</small>
            </div>
          </div>

          <aside className="rs-overview" aria-label={c.deskLabel}>
            <div className="rs-overview__topline"><span>{c.deskTitle}</span><strong>{c.deskStatus}</strong></div>
            <div className="rs-overview__case">
              <span className="rs-case-no">01</span>
              <div><strong>{c.deskProblem}</strong><small>{c.deskUnknown}</small></div>
            </div>
            <ol className="rs-overview__steps">
              {c.deskSteps.map((step, index) => <li key={step}><span>{index + 1}</span><strong>{step}</strong></li>)}
            </ol>
            <p className="rs-overview__caption">{c.deskLabel}</p>
          </aside>
        </section>

        <section className="rs-section rs-how" id="how-it-works">
          <div className="rs-section__heading"><p className="eyebrow">{c.howEyebrow}</p><h2>{c.howTitle}</h2><p>{c.howIntro}</p></div>
          <ol className="rs-process">
            {c.steps.map(([title, text], index) => (
              <li key={title}><span className="rs-process__number">0{index + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>
            ))}
          </ol>
        </section>

        <section className="rs-section rs-repairs" id="repairs">
          <div className="rs-repairs__copy">
            <p className="eyebrow">{c.repairsEyebrow}</p><h2>{c.repairsTitle}</h2><p>{c.repairsIntro}</p>
            <div className="rs-unsure"><span aria-hidden="true">?</span><div><strong>{c.unsureTitle}</strong><p>{c.unsureText}</p></div></div>
          </div>
          <div className="rs-repair-list">
            {c.repairTypes.map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item}</strong></div>)}
            <p>{c.evidence}</p>
          </div>
        </section>

        <section className="rs-section rs-why">
          <div className="rs-section__heading"><p className="eyebrow">{c.whyEyebrow}</p><h2>{c.whyTitle}</h2></div>
          <div className="rs-value-grid">
            {c.values.map(([title, text], index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{text}</p></article>)}
          </div>
        </section>

        <section className="rs-section rs-pilot">
          <div className="rs-pilot__copy"><p className="eyebrow">{c.pilotEyebrow}</p><h2>{c.pilotTitle}</h2><p>{c.pilotLead}</p><strong className="rs-free">{lang === "zh" ? "業主免費" : "Free for property owners"}</strong></div>
          <div className="rs-pilot__details"><ul>{c.pilotPoints.map((item) => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul><p>{c.pilotNote}</p></div>
        </section>

        <section className="rs-safety" aria-label={c.safetyTitle}>
          <span className="rs-safety__icon" aria-hidden="true">!</span><div><h2>{c.safetyTitle}</h2><p>{c.safetyText}</p></div>
        </section>

        <section className="rs-section rs-faq" id="faq">
          <div className="rs-section__heading"><p className="eyebrow">{c.faqEyebrow}</p><h2>{c.faqTitle}</h2></div>
          <div className="rs-faq__list">
            {c.faqs.map(([question, answer], index) => <details key={question}><summary><span>{String(index + 1).padStart(2, "0")}</span>{question}<i aria-hidden="true">+</i></summary><p>{answer}</p></details>)}
          </div>
        </section>

        <section className="rs-final-cta"><div><p className="eyebrow">SimpleFix</p><h2>{c.finalTitle}</h2><p>{c.finalText}</p></div><Link className="button rs-primary-cta" href="/landlord/repairs/new">{c.cta}<span aria-hidden="true">→</span></Link></section>
      </main>
    </SiteShell>
  );
}
