"use client";

import { BackLink, PageIntro, SiteShell } from "@/components/SiteShell";
import { useLanguage } from "@/components/LanguageContext";

// Lean, PDPO-framed Privacy Notice for the Hong Kong founding pilot —
// replaces the previous UK-drafted page (GDPR "lawful basis" terminology,
// the UK Information Commissioner's Office, a UK postcode field, an
// unconfirmed .co.uk contact address). Describes ACTUAL current product
// behaviour only, confirmed by reading the real submission flow
// (services/api.ts's ApiRepairSubmissionService.submit, the only call that
// ever sends personal data to a server — see components/
// RepairSubmissionPanel.tsx, where the matching Personal Information
// Collection Statement is presented) — no analytics, no real file uploads,
// no contractor-marketplace machinery are described as implemented, because
// none of them exist yet.
//
// KNOWN GAP, not silently omitted: there is no independently confirmed,
// real, monitored contact address for access/correction requests anywhere
// in this codebase (the old hello@repairscope.co.uk was never confirmed as
// current, and support@example.com is an obvious contractor-demo
// placeholder unrelated to this page) — see the "Access and correction
// rights" section below, which says so honestly instead of inventing one.
export default function PrivacyPage() {
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
          <h2>{c.whatWeCollect.heading}</h2>
          <p>{c.whatWeCollect.lead}</p>
          <ul>
            {c.whatWeCollect.bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>{c.whatWeCollect.noUploads}</p>
        </section>

        <section>
          <h2>{c.browserData.heading}</h2>
          {c.browserData.p.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>

        <section>
          <h2>{c.whyWeUse.heading}</h2>
          <ul>
            {c.whyWeUse.bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2>{c.requiredOptional.heading}</h2>
          {c.requiredOptional.p.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>

        <section>
          <h2>{c.contractorSharing.heading}</h2>
          {c.contractorSharing.p.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>

        <section>
          <h2>{c.thirdParties.heading}</h2>
          <p>{c.thirdParties.p}</p>
        </section>

        <section>
          <h2>{c.serviceProviders.heading}</h2>
          <p>{c.serviceProviders.p}</p>
        </section>

        <section>
          <h2>{c.authorities.heading}</h2>
          <p>{c.authorities.p}</p>
        </section>

        <section>
          <h2>{c.noSellingMarketing.heading}</h2>
          {c.noSellingMarketing.p.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>

        <section>
          <h2>{c.retention.heading}</h2>
          <p>{c.retention.p}</p>
        </section>

        <section>
          <h2>{c.security.heading}</h2>
          <p>{c.security.p}</p>
        </section>

        <section>
          <h2>{c.rights.heading}</h2>
          {c.rights.p.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>

        <section>
          <h2>{c.complaints.heading}</h2>
          <p>
            {c.complaints.pre}{" "}
            <a href="https://www.pcpd.org.hk" target="_blank" rel="noreferrer noopener">
              {c.complaints.linkText}
            </a>
            {c.complaints.post}
          </p>
        </section>

        <section>
          <h2>{c.changes.heading}</h2>
          <p>{c.changes.p}</p>
        </section>

        <p className="field-help">{c.lastUpdated}</p>
      </main>
    </SiteShell>
  );
}

const T = {
  zh: {
    eyebrow: "RepairScope 香港創始試用",
    title: "私隱政策",
    back: "返回主頁",
    intro: [
      "RepairScope 重視你提供的個人資料。",
      "呢份私隱政策解釋我哋在香港創始試用期間會收集咩資料、點解需要呢些資料、可能會同邊類人士分享，以及你對自己個人資料的權利。",
      "RepairScope 現時仍然係創始試用服務。除非日後另有更新，本政策只描述目前實際運作的服務。",
    ],
    whatWeCollect: {
      heading: "我哋收集咩資料",
      lead: "當你使用公開嘅維修申請表格，我哋可能會收集：",
      bullets: [
        "維修問題類型；",
        "你見到嘅情況同描述；",
        "有冇即時危險嘅安全相關答案；",
        "問題大約開始咗幾耐、幾常出現；",
        "之前有冇師傅睇過、報過價或者處理過；",
        "你有冇相片、影片、報告或者現有報價（只記錄「有冇」同種類，唔係實際檔案）；",
        "物業資料：地區、屋苑／大廈、座數、樓層、單位；",
        "你同物業嘅關係；",
        "開門安排；",
        "有冇聯絡過管理處，以及問題是否可能涉及公用地方；",
        "你補充嘅其他資料；",
        "姓名、電郵及／或電話號碼，同埋你偏好嘅聯絡方式；",
        "你喺提交前嘅同意記錄；",
        "整理出嚟嘅維修簡報，以及你對簡報作出嘅任何更正；",
        "個案參考編號等提交資料。",
      ],
      noUploads: "RepairScope 目前未有實際嘅檔案上載功能——表格只會記錄你係咪有相關證據同其種類，並唔會儲存實際嘅相片、影片或者文件檔案。如果之後 RepairScope 透過已同你確認嘅溝通方式（例如電郵）向你收集相片、影片、報告或者報價，經該方式提供嘅資料同樣會成為個案資料嘅一部分。",
    },
    browserData: {
      heading: "瀏覽器儲存嘅資料",
      p: [
        "RepairScope 可能會喺你嘅瀏覽器入面儲存有限度嘅資料，等網站可以記住你揀嘅語言，同埋等你之後可以繼續一份未完成嘅維修申請。",
        "呢啲資料只會儲存喺你自己嘅裝置，唔會用作分析用途。",
      ],
    },
    whyWeUse: {
      heading: "點解要用呢啲資料",
      bullets: [
        "接收同審閱你提交嘅維修申請；",
        "將資料整理成結構清晰嘅維修簡報；",
        "就你嘅個案聯絡你；",
        "向你查詢澄清問題；",
        "評估個案是否適合現階段嘅創始試用；",
        "如果個案獲接納，協助搵合適師傅同跟進下一步；",
        "整理師傅嘅提問、建議做法同報價；",
        "管理同保障呢個服務；",
        "處理同你嘅維修個案有關嘅問題；",
        "遵守適用嘅法律要求。",
      ],
    },
    requiredOptional: {
      heading: "必須提供／可選提供嘅資料",
      p: [
        "表格入面標示或者要求必須填寫嘅欄位，係處理你嘅維修申請所需要嘅——如果唔提供，我哋可能無法審閱或者處理你嘅申請。",
        "其他冇標示為必須嘅資料，你可以選擇唔提供。",
      ],
    },
    contractorSharing: {
      heading: "同師傅分享資料",
      p: [
        "提交維修申請本身唔會將資料自動傳俾任何師傅。",
        "初步提交所收集嘅同意，只涵蓋 RepairScope 人手審閱同就個案聯絡你，並唔代表你已經同意將資料分享俾師傅。",
        "如果個案獲接納，並且需要將可識別身份嘅維修或聯絡資料交俾師傅先可以跟進，我哋會先同你確認清楚，先至分享——而且只會分享跟進呢個目的合理需要嘅資料。",
      ],
    },
    thirdParties: {
      heading: "涉及第三者嘅資料",
      p: "如果你提交嘅資料涉及第三者（例如租客、其他住戶、管理處聯絡人或者師傅），請只提供處理呢次維修合理需要嘅資料，並且喺你有合理授權嘅情況下先至提供。",
    },
    serviceProviders: {
      heading: "服務供應商",
      p: "RepairScope 可能會使用協助我哋主機代管、儲存、保安或者營運呢個服務嘅技術服務供應商。呢啲供應商只可以喺為 RepairScope 提供服務所需要嘅範圍內處理資料。",
    },
    authorities: {
      heading: "執法機關及法律要求",
      p: "喺適用法律、法院命令或者有權限機關合理要求嘅情況下，RepairScope 可能需要披露資料。",
    },
    noSellingMarketing: {
      heading: "唔會出售資料，亦唔會用作直接推廣",
      p: [
        "RepairScope 唔會出售客戶嘅個人資料。",
        "喺創始試用期間，RepairScope 唔會用你為維修申請而提供嘅聯絡資料嚟發送直接推廣訊息。同你嘅維修個案有關嘅操作性溝通並唔屬於推廣。",
      ],
    },
    retention: {
      heading: "資料保留",
      p: "我哋只會在處理維修個案、合理跟進相關問題，以及履行適用法律要求所需的時間內保留個人資料。當資料不再需要時，我哋會採取合理措施刪除或匿名化有關資料。",
    },
    security: {
      heading: "資料保安",
      p: "RepairScope 會採取合理及切實可行嘅措施，保障個人資料唔會被未經授權或者意外地查閱、使用、遺失或者披露。",
    },
    rights: {
      heading: "查閱及更正權利",
      p: [
        "根據香港法例，你有權要求查閱 RepairScope 持有關於你嘅個人資料，亦有權要求更正唔準確嘅個人資料。",
        "查閱資料要求一般會喺適用嘅法定期限內處理（現時為 40 日）。",
        "處理呢類要求嘅正式聯絡方式現正確認緊，我哋會盡快喺呢頁公佈。",
      ],
    },
    complaints: {
      heading: "投訴",
      pre: "如果你對 RepairScope 處理你個人資料嘅方式有疑慮，可以向",
      linkText: "香港個人資料私隱專員公署（PCPD）",
      post: "反映。",
    },
    changes: {
      heading: "政策更新",
      p: "隨住創始試用進展，RepairScope 可能會更新呢份私隱政策，頁面底部會顯示最新更新日期。更新唔會令我哋將之前收集嘅資料用作無關嘅新目的。",
    },
    lastUpdated: "最後更新：2026年8月12日",
  },
  en: {
    eyebrow: "RepairScope Hong Kong Founding Pilot",
    title: "Privacy Notice",
    back: "Back to home",
    intro: [
      "RepairScope takes the privacy of the personal data you provide seriously.",
      "This Privacy Notice explains what information we collect during the Hong Kong founding pilot, why we collect it, the types of people or service providers with whom it may be shared, and your rights in relation to your personal data.",
      "RepairScope is currently a founding-pilot service. This Notice describes the service as it operates today unless it is updated in future.",
    ],
    whatWeCollect: {
      heading: "Information we collect",
      lead: "When you use the public repair intake form, we may collect:",
      bullets: [
        "the type of repair problem;",
        "what you have observed and how you describe it;",
        "safety-related answers about whether there is immediate danger;",
        "roughly how long the problem has been happening and how often it occurs;",
        "whether a contractor has already inspected, quoted or worked on it;",
        "whether you have photos, videos, a report or an existing quotation (only whether you have them and what kind — not the actual files);",
        "property details: district, estate/building, block, floor, unit;",
        "your relationship to the property;",
        "access arrangements;",
        "whether you have contacted building management, and whether the issue may involve a common area;",
        "any additional context you add;",
        "your name, email and/or phone number, and your preferred way to be contacted;",
        "your consent record given before submitting;",
        "the generated repair brief, and any corrections you make to it;",
        "submission information such as a case reference number.",
      ],
      noUploads: "RepairScope does not currently have real file upload functionality — the form only records whether you have relevant evidence and what kind, not the actual photo, video or document files. If RepairScope later collects photos, videos, reports or quotations from you through a communication channel you have agreed to (for example, email), information provided that way also becomes part of the repair case.",
    },
    browserData: {
      heading: "Information stored in your browser",
      p: [
        "RepairScope may store limited information in your browser so that the site can remember your language preference and let you resume an unfinished repair submission.",
        "This information stays on your own device and is not used for analytics.",
      ],
    },
    whyWeUse: {
      heading: "Why we use this information",
      bullets: [
        "receiving and reviewing the repair request you submit;",
        "organising information into a structured repair brief;",
        "contacting you about your case;",
        "asking you clarification questions;",
        "assessing whether the case is suitable for the current founding pilot;",
        "where a case is accepted, helping source suitable contractors and coordinate next steps;",
        "organising contractor questions, proposed approaches and quotations;",
        "administering and securing the service;",
        "resolving issues relating to your repair case;",
        "complying with applicable legal requirements.",
      ],
    },
    requiredOptional: {
      heading: "Required and optional information",
      p: [
        "Fields marked or enforced as required in the form are needed to process your repair request — if not supplied, we may be unable to review or process it.",
        "Other information that is not marked as required can be left out.",
      ],
    },
    contractorSharing: {
      heading: "Sharing information with contractors",
      p: [
        "Submitting a repair request does not automatically send your information to any contractor.",
        "The consent collected at initial submission covers RepairScope manually reviewing and contacting you about the case only — it does not mean you have agreed to have your information shared with a contractor.",
        "If a case is accepted and identifiable repair or contact information needs to be shared with a contractor to progress it, we will confirm this with you first — and will only share what is reasonably necessary for that purpose.",
      ],
    },
    thirdParties: {
      heading: "Information about other people",
      p: "If the information you submit relates to someone else (for example a tenant, another occupant, a building-management contact or a contractor), please only provide what is reasonably necessary for the repair, and only where you are appropriately authorised to do so.",
    },
    serviceProviders: {
      heading: "Service providers",
      p: "RepairScope may use technical service providers that help host, store, secure or operate the service. These providers may only handle information as needed to provide their services to RepairScope.",
    },
    authorities: {
      heading: "Authorities and legal requirements",
      p: "RepairScope may disclose information where reasonably required by applicable law, court order or lawful authority.",
    },
    noSellingMarketing: {
      heading: "No selling of data, no direct marketing",
      p: [
        "RepairScope does not sell customer personal data.",
        "During the founding pilot, RepairScope does not use contact details supplied for a repair request to send direct marketing. Operational communication about your repair case is not marketing.",
      ],
    },
    retention: {
      heading: "Data retention",
      p: "We keep personal data only for as long as reasonably necessary to review and operate the repair case, deal with reasonable follow-up matters and meet applicable legal requirements. When information is no longer needed, we take reasonable steps to delete or anonymise it.",
    },
    security: {
      heading: "Security",
      p: "RepairScope takes reasonable and practicable measures to protect personal data against unauthorised or accidental access, use, loss or disclosure.",
    },
    rights: {
      heading: "Access and correction rights",
      p: [
        "Under Hong Kong law, you have the right to request access to personal data RepairScope holds about you, and to request correction of inaccurate personal data.",
        "A data access request is generally handled within the applicable statutory timeframe (currently 40 days).",
        "The dedicated contact channel for handling these requests is still being confirmed and will be published on this page shortly.",
      ],
    },
    complaints: {
      heading: "Complaints",
      pre: "If you are concerned about how RepairScope has handled your personal data, you may raise the matter with the",
      linkText: "Office of the Privacy Commissioner for Personal Data, Hong Kong (PCPD)",
      post: ".",
    },
    changes: {
      heading: "Changes to this notice",
      p: "RepairScope may update this Privacy Notice as the founding pilot develops — the latest update date is shown at the bottom of this page. An update will not be used to apply previously collected data to an unrelated new purpose.",
    },
    lastUpdated: "Last updated: 12 August 2026",
  },
} as const;
