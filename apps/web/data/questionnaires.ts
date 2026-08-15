import { lt } from "@/domain/i18n";
import type { LocalizedText } from "@/domain/i18n";
import { normaliseMultiSelectValue } from "@/domain/rules";
import type {
  QuestionnaireField,
  QuestionnaireOption,
  QuestionnaireSchema,
  QuestionnaireStep,
  RepairCategoryId,
  SafetyRule,
} from "@/domain/types";

// Transcribed from the approved Sites HK questionnaire export
// (RepairScope-Hong-Kong.zip, app/page.tsx) — that file is the UX/copy
// reference; this module re-implements its content inside the existing
// schema-driven QuestionnaireEngine rather than adopting its component tree
// or backend.

const option = (
  value: string,
  zh: string,
  en: string,
  hintZh?: string,
  hintEn?: string,
): QuestionnaireOption => ({
  value,
  label: lt(zh, en),
  hint: hintZh && hintEn ? lt(hintZh, hintEn) : undefined,
});

const select = (
  id: string,
  labelZh: string,
  labelEn: string,
  options: QuestionnaireOption[],
  required = true,
  safetyRule?: SafetyRule,
  display: "pill" | "list" | "grid" = "list",
): QuestionnaireField => ({
  id,
  type: "single_select",
  label: lt(labelZh, labelEn),
  options,
  required,
  safetyRule,
  display,
});

// Observable-symptom questions (audited per category — see the branches
// map's own symptomSlot comments) allow more than one selection plus
// "Other", since real repair situations often show more than one symptom
// at once. "unsure" is always the ALREADY-PRESENT option value in every
// branch category's own option list (never a second, duplicate "unsure")
// — this only marks it as exclusiveValue; "other" is appended as a new
// option and marked otherValue, non-exclusive.
export const SYMPTOM_OTHER_VALUE = "other";
const SYMPTOM_NOT_SURE_VALUE = "unsure";

const multiSelect = (
  id: string,
  labelZh: string,
  labelEn: string,
  options: QuestionnaireOption[],
  safetyRule?: SafetyRule,
): QuestionnaireField => ({
  id,
  type: "multi_select",
  label: lt(labelZh, labelEn),
  options: [...options, option(SYMPTOM_OTHER_VALUE, "其他", "Other")],
  required: true,
  safetyRule,
  display: "pill",
  exclusiveValue: SYMPTOM_NOT_SURE_VALUE,
  otherValue: SYMPTOM_OTHER_VALUE,
  help: lt("可以揀多過一項", "You can select more than one"),
});

const text = (
  id: string,
  labelZh: string,
  labelEn: string,
  placeholderZh: string,
  placeholderEn: string,
  required = true,
  long = false,
): QuestionnaireField => ({
  id,
  type: long ? "long_text" : "short_text",
  label: lt(labelZh, labelEn),
  placeholder: lt(placeholderZh, placeholderEn),
  required,
});

const step = (
  id: string,
  eyebrowZh: string,
  eyebrowEn: string,
  titleZh: string,
  titleEn: string,
  fields: QuestionnaireField[],
  descriptionZh?: string,
  descriptionEn?: string,
): QuestionnaireStep => ({
  id,
  eyebrow: lt(eyebrowZh, eyebrowEn),
  title: lt(titleZh, titleEn),
  description:
    descriptionZh && descriptionEn ? lt(descriptionZh, descriptionEn) : undefined,
  fields,
});

// ---------------------------------------------------------------------------
// Category taxonomy — observable problems, not trades (see domain/types.ts).
// ---------------------------------------------------------------------------

export const categoryOptions: QuestionnaireOption[] = [
  option("leak", "滲水／漏水", "Water seepage / leakage"),
  option("drainage", "去水／渠務問題", "Drainage problem"),
  option("plumbing", "水喉問題", "Plumbing problem"),
  option("electrical", "電力／跳掣／冇電", "Electrical / power problem"),
  option("aircon", "冷氣問題", "Air-conditioning problem"),
  option("door-window", "門窗問題", "Door / window problem"),
  option("surface", "牆身／天花／地板損壞", "Wall / ceiling / floor damage"),
  option("bathroom", "浴室／潔具問題", "Bathroom / sanitary fixture problem"),
  option("other", "其他維修", "Other repair"),
  option("unsure", "唔肯定", "Not sure"),
];

export const categoryCards = categoryOptions.map((item) => ({
  category: item.value as RepairCategoryId,
  label: item.label,
}));

// ---------------------------------------------------------------------------
// Safety — one shared check (not per-category). Answering anything other
// than "none" is a full-screen safety exit (see components/LandlordApp.tsx's
// SafetyExit screen) — never an inline "acknowledge and continue" card. A
// second, category-specific trigger exists on electrical's first branch
// question (smell/sparks) — see electricalBranch below.
// ---------------------------------------------------------------------------

export const generalSafetyRule: SafetyRule = {
  triggerValues: ["fire", "gas", "flood", "structure"],
  title: lt("先處理安全", "Safety first"),
  message: lt(
    "如果有人身危險、火警、濃烈煤氣味或情況失控，請離開危險範圍並撥 999。亦請盡快聯絡大廈管理處或相關緊急服務。",
    "If anyone is in immediate danger, there is fire, a strong gas smell or the situation is uncontrolled, leave the danger area and call 999. Contact building management or the relevant emergency service as soon as possible.",
  ),
  acknowledgement: lt(
    "RepairScope 唔會就緊急情況提供診斷。安全處理完成後，你可以返嚟重新整理非緊急維修資料。",
    "RepairScope does not diagnose emergencies. Once the situation is safe, you can return to organise the non-urgent repair information.",
  ),
  severity: "stop",
};

const safetyField: QuestionnaireField = select(
  "safety",
  "而家有冇以下即時危險？",
  "Is there any immediate danger right now?",
  [
    option(
      "fire",
      "有火、煙、燒焦味或電器冒火花",
      "Fire, smoke, burning smell or electrical sparks",
    ),
    option("gas", "有濃烈煤氣／石油氣味", "Strong town gas / LPG smell"),
    option(
      "flood",
      "大量入水、爆喉或水勢控制唔到",
      "Major water ingress, burst pipe or uncontrolled flow",
    ),
    option(
      "structure",
      "有石屎跌落、天花鬆脫或倒塌風險",
      "Falling concrete, loose ceiling or collapse risk",
    ),
    option("none", "以上都冇，可以繼續", "None of these — safe to continue"),
  ],
  true,
  generalSafetyRule,
);

const safetyStep: QuestionnaireStep = step(
  "safety",
  "安全檢查",
  "SAFETY CHECK",
  "而家有冇以下即時危險？",
  "Is there any immediate danger right now?",
  [safetyField],
  "呢一步只係幫你判斷應唔應該等報價，唔係作出診斷。",
  "This only checks whether it is appropriate to wait for quotations. It is not a diagnosis.",
);

// ---------------------------------------------------------------------------
// Shared tail — identical steps after the category-specific "affected" +
// "branch" (or "other-detail") steps, for every category.
// ---------------------------------------------------------------------------

const durationOptions = [
  option("today", "今日", "Today"),
  option("week", "一星期內", "Within a week"),
  option("month", "一個月內", "Within a month"),
  option("longer", "超過一個月", "More than a month"),
  option("unsure", "唔肯定", "Not sure"),
];
const frequencyOptions = [
  option("once", "只見過一次", "Seen once"),
  option("occasional", "間中", "Occasionally"),
  option("daily", "每日", "Daily"),
  option("constant", "持續", "Constant"),
  option("unsure", "唔肯定", "Not sure"),
];
const worseningOptions = [
  option("yes", "有惡化", "Getting worse"),
  option("no", "冇惡化", "Not getting worse"),
  option("same", "差唔多", "About the same"),
  option("unsure", "唔肯定", "Not sure"),
];
export const priorOptions = [
  option("inspected", "只係睇過／檢查過", "Inspected only"),
  option("quote", "收到報價", "Quotation received"),
  option("attempted", "已經試過維修", "Repair already attempted"),
  option("no", "冇", "No"),
];
const managementOptions = [
  option("yes", "有聯絡", "Contacted"),
  option("no", "未有聯絡", "Not contacted"),
  option("not-applicable", "唔適用", "Not applicable"),
];
const sharedAreaOptions = [
  option("yes", "可能有關", "Possibly involved"),
  option("no", "暫時睇唔到", "Does not appear involved"),
  option("unsure", "唔肯定", "Not sure"),
];
export const accessOptions = [
  option("owner", "業主本人", "Owner"),
  option("tenant", "租客", "Tenant"),
  option("family", "家人", "Family member"),
  option("management", "管理處", "Management office"),
  option("other", "其他人", "Someone else"),
];
export const relationshipOptions = [
  option("owner-occupier", "自住業主", "Owner-occupier"),
  option("landlord", "出租物業業主", "Landlord"),
  option("manager", "代業主管理", "Managing on behalf of owner"),
  option("other", "其他", "Other"),
];
export const evidenceKindOptions = [
  option("repair-media", "維修相片／影片", "Repair photo / video"),
  option("document", "報告／文件", "Report / document"),
  option("quotation", "現有報價", "Existing quotation"),
];

export const districtGroups = [
  {
    label: lt("香港島", "Hong Kong Island"),
    options: [
      option("central-western", "中西區", "Central and Western"),
      option("wan-chai", "灣仔區", "Wan Chai"),
      option("eastern", "東區", "Eastern"),
      option("southern", "南區", "Southern"),
    ],
  },
  {
    label: lt("九龍", "Kowloon"),
    options: [
      option("yau-tsim-mong", "油尖旺區", "Yau Tsim Mong"),
      option("sham-shui-po", "深水埗區", "Sham Shui Po"),
      option("kowloon-city", "九龍城區", "Kowloon City"),
      option("wong-tai-sin", "黃大仙區", "Wong Tai Sin"),
      option("kwun-tong", "觀塘區", "Kwun Tong"),
    ],
  },
  {
    label: lt("新界及離島", "New Territories & Islands"),
    options: [
      option("kwai-tsing", "葵青區", "Kwai Tsing"),
      option("tsuen-wan", "荃灣區", "Tsuen Wan"),
      option("tuen-mun", "屯門區", "Tuen Mun"),
      option("yuen-long", "元朗區", "Yuen Long"),
      option("north", "北區", "North"),
      option("tai-po", "大埔區", "Tai Po"),
      option("sha-tin", "沙田區", "Sha Tin"),
      option("sai-kung", "西貢區", "Sai Kung"),
      option("islands", "離島區", "Islands"),
    ],
  },
];
export const districtOptions = districtGroups.flatMap((group) => group.options);

const timelineStep = step(
  "timeline",
  "發生經過",
  "WHAT HAS CHANGED OVER TIME",
  "個問題持續咗幾耐，同埋點樣出現？",
  "How long has this been happening, and how does it behave?",
  [
    select("duration", "幾時開始？", "When did it begin?", durationOptions, true, undefined, "pill"),
    select("frequency", "幾常出現？", "How often?", frequencyOptions, true, undefined, "pill"),
    select("worsening", "有冇惡化？", "Is it getting worse?", worseningOptions, true, undefined, "pill"),
  ],
  "三個簡短答案可以幫師傅理解情況，唔使估原因。",
  "Three short facts help a contractor understand the situation without guessing the cause.",
);

const priorStep = step(
  "prior",
  "之前有冇處理過",
  "WHAT HAS ALREADY HAPPENED",
  "已經有冇師傅睇過或者報過價？",
  "Has anyone inspected the problem or provided a quotation?",
  [
    select("prior", "之前處理", "Previous action", priorOptions),
    // Only relevant once the owner has said something already happened —
    // hidden (and cleared from responses by QuestionnaireEngine's
    // changeResponse) when prior is "no", so a stale answer typed before
    // switching to "no" can never survive into the brief.
    {
      ...text(
        "priorDetail",
        "之前有人點樣講？（可選填）",
        "What were you told? (optional)",
        "照對方原本講法寫就可以，唔代表已證實。",
        "Use their original explanation. It will not be treated as confirmed.",
        false,
        true,
      ),
      showWhen: { fieldId: "prior", equals: ["inspected", "quote", "attempted"] },
    },
  ],
  "我哋會分開記低檢查、報價同已做工程，避免將意見當成已證實成因。",
  "We keep inspection, quotation and attempted work separate, so an opinion is not treated as a confirmed cause.",
);

// No real file upload exists yet (see docs/PUBLIC_INGESTION_LAUNCH.md and
// RepairSubmissionPanel's evidenceNotes field) — this step deliberately asks
// only whether evidence exists and of what kind, not for a file, so it never
// claims an upload that never happens.
const evidenceStep = step(
  "evidence",
  "相片同文件",
  "PHOTOS AND DOCUMENTS",
  "有冇資料可以幫我哋睇清楚？",
  "Do you have anything that helps show the problem?",
  [
    select(
      "hasEvidence",
      "你有冇維修相片、影片、報告或現有報價？",
      "Do you have repair photos, videos, reports or an existing quotation?",
      [
        option("yes", "有，稍後可以提供", "Yes, I can provide this later"),
        option("no", "冇", "No"),
      ],
    ),
    // Only relevant once the owner has said evidence exists — hidden (and
    // cleared from responses) when hasEvidence is "no", so answering "No
    // evidence" cannot leave a stale evidenceKind in the brief.
    {
      ...select(
        "evidenceKind",
        "主要係邊類資料？",
        "What kind, mainly?",
        evidenceKindOptions,
        false,
        undefined,
      ),
      showWhen: { fieldId: "hasEvidence", equals: "yes" },
    },
  ],
  "檔案上載暫時未開放；RepairScope 會喺人手檢視之後另外聯絡你補交。",
  "File upload is not yet available — RepairScope will contact you separately to collect this after manual review.",
);

const buildingStep = step(
  "building",
  "大廈背景",
  "BUILDING CONTEXT",
  "有冇其他單位或管理處可能要一齊了解？",
  "Might building management or another flat need to be involved?",
  [
    select(
      "management",
      "有冇聯絡過管理處？",
      "Have you contacted building management?",
      managementOptions,
    ),
    select(
      "sharedArea",
      "問題有冇可能同樓上、隔離單位或者公用地方有關？",
      "Could the problem involve another flat or a common area?",
      sharedAreaOptions,
    ),
  ],
  "你唔需要判斷責任，照你知道嘅程度答就得。",
  "You do not need to decide responsibility. Answer only to the extent you know.",
);

const accessStep = step(
  "access",
  "上門安排",
  "PRACTICAL ACCESS",
  "如果需要上門，邊個可以開門？",
  "If a visit is needed, who can provide access?",
  [
    select("accessBy", "開門安排", "Access provided by", accessOptions),
    text(
      "availability",
      "通常咩時段較方便？",
      "What times are usually practical?",
      "例如：平日 7 點後；星期六上午",
      "For example: weekdays after 7pm; Saturday mornings",
    ),
  ],
  "而家唔需要預約確實時間，只要講大概安排。",
  "You do not need to book an exact appointment now — just give practical availability.",
);

const addressStep = step(
  "address",
  "物業位置",
  "PROPERTY LOCATION",
  "維修單位喺邊度？",
  "Where is the property?",
  [
    {
      id: "district",
      type: "single_select",
      label: lt("地區", "District"),
      required: true,
      options: districtOptions,
    },
    // Only district is required — a common-area issue, village house,
    // whole-building problem, or a case where the owner is not certain of
    // the exact unit are all legitimate Hong Kong submissions that should
    // not be blocked by requiring every address component.
    text("building", "屋苑／大廈（如適用）", "Estate / Building (if applicable)", "", "", false),
    text("block", "座數（如適用）", "Block / Tower (if applicable)", "", "", false),
    text("floor", "樓層（如適用）", "Floor (if applicable)", "", "", false),
    text("unit", "單位（如適用）", "Flat / Unit (if applicable)", "", "", false),
  ],
  "詳細地址只會用作人手檢視同合適跟進，唔會自動公開。如果係公用地方、村屋、成幢大廈或者未肯定確實單位，可以留空相關欄位。",
  "The detailed address is used for manual review and appropriate follow-up. It is not automatically published. Leave a field blank if it does not apply — for example a common-area issue, a village house, a whole-building problem, or an uncertain exact unit.",
);

const relationshipStep = step(
  "relationship",
  "同物業嘅關係",
  "YOUR RELATIONSHIP TO THE PROPERTY",
  "你係以咩身份處理呢次維修？",
  "In what capacity are you handling this repair?",
  [select("relationship", "處理身份", "Relationship", relationshipOptions)],
  "我哋會按情況確認之後嘅同意同聯絡安排。",
  "This helps us confirm consent and communication arrangements later.",
);

const additionalStep = step(
  "additional",
  "可選填",
  "OPTIONAL",
  "仲有冇其他資料想話俾我哋知？",
  "Anything else we should know?",
  [
    text(
      "additionalContext",
      "補充資料",
      "Additional information",
      "例如：問題喺裝修工程之後先出現……（可留空）",
      "For example: This started after recent renovation work… (optional)",
      false,
      true,
    ),
  ],
  "如果前面嘅答案已經講清楚，可以直接繼續。",
  "If the earlier answers cover the problem, you can continue without adding anything.",
);

const sharedTail: QuestionnaireStep[] = [
  timelineStep,
  priorStep,
  evidenceStep,
  buildingStep,
  accessStep,
  addressStep,
  relationshipStep,
  additionalStep,
];

/** Field ids shared by every category's tail — used by category-change to keep only genuinely shared answers. See domain/journey.ts. */
export const sharedTailFieldIds = new Set(
  [safetyStep, ...sharedTail].flatMap((s) => s.fields.map((field) => field.id)),
);

// Bump this whenever a category's fields, steps or safety rules change in a
// way that matters for how a submitted answer set should be interpreted —
// persisted on every RepairSubmission (see questionnaireVersionLabel below)
// so past submissions remain interpretable after the schema evolves.
//
// v2 -> v3: each category's observable-symptom branch question (see the
// branches map's own symptomSlot) became multi_select plus "Other", so its
// stored value may now be string[] instead of a single string — a real
// shape/meaning change, not just new copy. An in-progress browser draft
// stored under v2 fails the existing schemaVersion check in
// readJourneyDraft/readJourneyBrief and is discarded in favour of a fresh
// questionnaire, exactly the same already-accepted behaviour every prior
// version bump has used — see docs/PUBLIC_INGESTION_LAUNCH.md. This never
// touches already-submitted historical cases: their persisted
// questionnaire_answers/generated_brief are read as-is (a plain string is
// simply a one-item selection — see resolveAnswerLabels), never
// reprocessed or invalidated.
const CURRENT_SCHEMA_VERSION = 3;

interface BranchDefinition {
  affected: { titleZh: string; titleEn: string; options: QuestionnaireOption[] };
  first: { titleZh: string; titleEn: string; options: QuestionnaireOption[]; safetyRule?: SafetyRule };
  second: { titleZh: string; titleEn: string; options: QuestionnaireOption[] };
  third: { titleZh: string; titleEn: string; options: QuestionnaireOption[] };
  /**
   * Which branch slot is this category's observable-symptom question
   * ("what can you observe?") — the one converted to multi_select plus
   * "Other" (real repair situations often show more than one symptom at
   * once — e.g. dripping AND discoloured water). The other two slots keep
   * a single answer: they measure timing, extent, history or status, none
   * of which are a "select every symptom you see" question by meaning, not
   * by position — see this file's own category-by-category reasoning in
   * the branches map below. leak is the only category where this is
   * "second", not "first" (leak's own first slot is a timing question).
   */
  symptomSlot: "first" | "second";
}

// Electrical's first branch answer can itself be an immediate safety exit
// (burning smell / sparks) — a second, category-specific trigger alongside
// the shared safety step (see generalSafetyRule above).
const electricalSparksRule: SafetyRule = {
  triggerValues: ["smell-sparks"],
  title: lt("先處理安全", "Safety first"),
  message: generalSafetyRule.message,
  acknowledgement: generalSafetyRule.acknowledgement,
  severity: "stop",
};

const branches: Record<string, BranchDefinition> = {
  leak: {
    affected: {
      titleZh: "發現問題喺邊度？",
      titleEn: "Where can you see the problem?",
      options: [
        option("ceiling", "天花", "Ceiling"),
        option("wall", "牆身", "Wall"),
        option("window", "窗邊", "Around a window"),
        option("bathroom", "浴室", "Bathroom"),
        option("floor", "地台", "Floor"),
        option("other", "其他", "Other"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    first: {
      titleZh: "通常幾時出現？",
      titleEn: "When does it usually happen?",
      options: [
        option("rain", "落雨時／落雨之後", "During / after rain"),
        option("use", "用水時", "When water is being used"),
        option("constant", "持續出現", "All the time"),
        option("intermittent", "間中出現", "Intermittent"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    second: {
      titleZh: "見到嘅情況係點？",
      titleEn: "What can you see?",
      options: [
        option("mark", "水印／濕痕", "Water mark / damp patch"),
        option("drip", "滴水", "Dripping"),
        option("mould", "發霉／油漆剝落", "Mould / peeling paint"),
        option("bulge", "牆身鼓起／石屎剝落", "Bulging surface / loose concrete"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    third: {
      titleZh: "影響範圍有幾大？",
      titleEn: "How much is affected?",
      options: [
        option("spot", "一小處", "One small area"),
        option("several", "幾個位置", "Several areas"),
        option("large", "大片範圍", "A large area"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    // leak's own first slot is a timing question ("when does it usually
    // happen?"), not an observable-symptom one — the symptom question here
    // is second ("what can you see?": water mark, dripping, mould,
    // bulging — these genuinely coexist, e.g. a water mark AND mould).
    symptomSlot: "second",
  },
  drainage: {
    affected: {
      titleZh: "邊個去水位有問題？",
      titleEn: "Which outlet is affected?",
      options: [
        option("toilet", "座廁", "Toilet"),
        option("basin", "洗手盆／鋅盤", "Basin / sink"),
        option("shower", "企缸／浴缸", "Shower / bath"),
        option("floor-drain", "地渠", "Floor drain"),
        option("several", "多過一個去水位", "More than one outlet"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    first: {
      titleZh: "去水情況係點？",
      titleEn: "What is the drainage doing?",
      options: [
        option("blocked", "完全塞咗", "Completely blocked"),
        option("slow", "去水好慢", "Draining slowly"),
        option("backflow", "有水倒灌／溢出", "Backing up / overflowing"),
        option("smell", "主要係有異味", "Mainly an unusual smell"),
        option("noise", "有異常聲", "Unusual noise"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    second: {
      titleZh: "之前有冇試過？",
      titleEn: "Has it happened before?",
      options: [
        option("first", "第一次", "First time"),
        option("recurring", "之前試過，今次再發生", "Recurring"),
        option("frequent", "經常發生", "Happens often"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    third: {
      titleZh: "有幾多個去水位受影響？",
      titleEn: "How many outlets are affected?",
      options: [
        option("one", "一個", "One"),
        option("several", "兩個或以上", "Two or more"),
        option("whole", "全屋多處", "Several around the flat"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    // first ("what is the drainage doing?": blocked, slow, backflow, smell,
    // noise) is the observable-symptom question — these can genuinely
    // coexist (e.g. blocked AND smelling, or slow AND noisy).
    symptomSlot: "first",
  },
  plumbing: {
    affected: {
      titleZh: "邊個位置或設備受影響？",
      titleEn: "Which area or fitting is affected?",
      options: [
        option("kitchen", "廚房", "Kitchen"),
        option("bathroom", "浴室", "Bathroom"),
        option("toilet", "座廁", "Toilet"),
        option("visible-pipe", "見到嘅喉管", "Visible pipe"),
        option("whole", "全屋供水", "Whole-flat water supply"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    first: {
      titleZh: "你見到咩情況？",
      titleEn: "What can you observe?",
      options: [
        option("leak", "滴水／漏水", "Dripping / leaking"),
        option("no-water", "冇水", "No water"),
        option("pressure", "水壓低／不穩", "Low / uneven pressure"),
        option("fitting", "水龍頭或潔具損壞", "Damaged tap / fitting"),
        option("colour", "水有異色／鏽色", "Discoloured / rusty water"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    second: {
      titleZh: "問題通常幾時出現？",
      titleEn: "When does it happen?",
      options: [
        option("constant", "長期都有", "Constant"),
        option("use", "用水時先出現", "Only during use"),
        option("intermittent", "間中出現", "Intermittent"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    third: {
      titleZh: "而家可唔可以關水掣控制？",
      titleEn: "Can the water be isolated?",
      options: [
        option("yes", "可以", "Yes"),
        option("no", "唔可以／控制唔到", "No / cannot control it"),
        option("not-needed", "唔需要關水", "Not needed"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    // first ("what can you observe?": dripping, no water, low pressure,
    // damaged fitting, discoloured water) is the observable-symptom
    // question — the task's own example (dripping + low pressure +
    // discoloured water) is this exact field.
    symptomSlot: "first",
  },
  electrical: {
    affected: {
      titleZh: "影響邊個範圍？",
      titleEn: "What area is affected?",
      options: [
        option("one-fitting", "一盞燈／一個插座", "One light / outlet"),
        option("one-room", "一個房間", "One room"),
        option("several", "幾個位置", "Several areas"),
        option("whole", "全屋", "Whole flat"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    first: {
      titleZh: "你見到咩情況？",
      titleEn: "What can you observe?",
      options: [
        option("no-power", "冇電", "No power"),
        option("tripping", "跳掣", "Circuit keeps tripping"),
        option("outlet", "插座／開關有問題", "Outlet / switch problem"),
        option("light", "燈有問題", "Light problem"),
        option("smell-sparks", "燒焦味／煙／火花", "Burning smell / smoke / sparks"),
        option("unsure", "唔肯定", "Not sure"),
      ],
      safetyRule: electricalSparksRule,
    },
    second: {
      titleZh: "之前有冇發生過？",
      titleEn: "Has it happened before?",
      options: [
        option("once", "今次第一次", "First time"),
        option("recurring", "間中再發生", "Recurring"),
        option("frequent", "近期成日發生", "Frequently recently"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    third: {
      titleZh: "受影響設備而家仲有冇使用？",
      titleEn: "Is the affected item still in use?",
      options: [
        option("stopped", "已停止使用", "No, stopped using it"),
        option("isolated", "已關掣／拔插頭", "Switched off / unplugged"),
        option("using", "仲使用緊", "Yes, still in use"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    // first ("what can you observe?": no power, tripping, outlet/switch
    // problem, light problem, burning smell/smoke/sparks) is the
    // observable-symptom question — e.g. tripping AND an outlet problem
    // can genuinely coexist. Carries the smell/sparks safety trigger
    // (electricalSparksRule) regardless of what else is also selected —
    // see domain/rules.ts's responseTriggersSafetyRule.
    symptomSlot: "first",
  },
  aircon: {
    affected: {
      titleZh: "邊類冷氣機有問題？",
      titleEn: "What type of air conditioner is affected?",
      options: [
        option("split", "分體式", "Split type"),
        option("window", "窗口式", "Window type"),
        option("concealed", "天花／藏喉式", "Ceiling / concealed type"),
        option("portable", "移動式", "Portable type"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    first: {
      titleZh: "你見到咩情況？",
      titleEn: "What can you observe?",
      options: [
        option("not-cooling", "唔凍／唔夠凍", "Not cooling"),
        option("water", "滴水／漏水", "Leaking water"),
        option("noise", "有異常聲", "Unusual noise"),
        option("no-start", "開唔到", "Will not turn on"),
        option("smell", "有異味", "Unusual smell"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    second: {
      titleZh: "問題影響幾多部機？",
      titleEn: "How many units are affected?",
      options: [
        option("one", "一部", "One"),
        option("several", "兩部或以上", "Two or more"),
        option("all", "全部", "All units"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    third: {
      titleZh: "最近有冇清洗或維修過？",
      titleEn: "Has it been serviced recently?",
      options: [
        option("recent", "三個月內", "Within three months"),
        option("past-year", "一年內", "Within a year"),
        option("no", "冇／好耐之前", "No / a long time ago"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    // first ("what can you observe?": not cooling, leaking water, unusual
    // noise, will not turn on, unusual smell) is the observable-symptom
    // question — not cooling AND leaking water is a common real combination.
    symptomSlot: "first",
  },
  "door-window": {
    affected: {
      titleZh: "邊樣受影響？",
      titleEn: "What is affected?",
      options: [
        option("door", "門", "Door"),
        option("window", "窗", "Window"),
        option("sliding", "趟門／趟窗", "Sliding door / window"),
        option("lock", "門鎖／窗鎖", "Lock"),
        option("glass", "玻璃", "Glass"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    first: {
      titleZh: "你見到咩情況？",
      titleEn: "What can you observe?",
      options: [
        option("close", "關唔到／閂唔實", "Will not close properly"),
        option("water", "入水／滲水", "Water ingress"),
        option("hardware", "較／轆／手柄損壞", "Damaged hinge / roller / handle"),
        option("glass", "玻璃裂咗／爛咗", "Cracked / broken glass"),
        option("frame", "框架變形／鬆脫", "Damaged / loose frame"),
        option("lock", "鎖有問題", "Lock problem"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    second: {
      titleZh: "而家可唔可以安全關好？",
      titleEn: "Can it be secured safely?",
      options: [
        option("yes", "可以", "Yes"),
        option("partial", "勉強可以", "Partly"),
        option("no", "唔可以", "No"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    third: {
      titleZh: "問題係突然出現定慢慢變差？",
      titleEn: "Did it happen suddenly or gradually?",
      options: [
        option("sudden", "突然", "Suddenly"),
        option("gradual", "慢慢變差", "Gradually"),
        option("always", "一直都係咁", "Always been like this"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    // first ("what can you observe?": won't close, water ingress, damaged
    // hardware, cracked glass, damaged frame, lock problem) is the
    // observable-symptom question — e.g. a damaged hinge AND it will not
    // close properly commonly co-occur. second ("can it be secured
    // safely?") is a status question, and third (sudden/gradual) is an
    // onset question — both remain single-select.
    symptomSlot: "first",
  },
  surface: {
    affected: {
      titleZh: "邊個表面受損？",
      titleEn: "Which surface is damaged?",
      options: [
        option("wall", "牆身", "Wall"),
        option("ceiling", "天花", "Ceiling"),
        option("floor", "地板／地磚", "Floor / tiles"),
        option("several", "多過一處", "More than one"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    first: {
      titleZh: "你見到咩情況？",
      titleEn: "What can you observe?",
      options: [
        option("crack", "裂紋", "Crack"),
        option("loose", "鬆脫／剝落", "Loose / peeling surface"),
        option("bulge", "鼓起", "Bulging"),
        option("stain", "污漬／水印", "Stain / water mark"),
        option("broken", "破損／凹陷", "Broken / dented"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    second: {
      titleZh: "受損範圍有幾大？",
      titleEn: "How large is the damaged area?",
      options: [
        option("small", "一小處", "One small area"),
        option("several", "幾處", "Several areas"),
        option("large", "大片範圍", "A large area"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    third: {
      titleZh: "附近有冇見到水氣或滲水？",
      titleEn: "Is there dampness or seepage nearby?",
      options: [
        option("yes", "有", "Yes"),
        option("no", "冇", "No"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    // first ("what can you observe?": crack, loose/peeling, bulging,
    // stain/water mark, broken/dented) is the observable-symptom
    // question — a crack AND a stain commonly coexist. second (extent)
    // and third (a single yes/no/unsure dampness check, not itself a
    // "select every symptom" question) remain single-select.
    symptomSlot: "first",
  },
  bathroom: {
    affected: {
      titleZh: "浴室邊一部分受影響？",
      titleEn: "Which part of the bathroom is affected?",
      options: [
        option("toilet", "座廁", "Toilet"),
        option("basin", "洗手盆", "Basin"),
        option("shower", "企缸／花灑", "Shower"),
        option("bath", "浴缸", "Bath"),
        option("tiles", "磁磚／填縫", "Tiles / grout"),
        option("sealant", "唧膠／防水膠邊", "Sealant"),
        option("drain", "去水位", "Drain"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    first: {
      titleZh: "你見到邊啲問題？",
      titleEn: "What problems can you see?",
      options: [
        option("leak", "漏水／滲水", "Leakage / seepage"),
        option("drain", "去水慢／淤塞", "Slow / blocked drain"),
        option("loose", "鬆脫／破損", "Loose / damaged fitting"),
        option("sealant", "膠邊發霉／甩開", "Mouldy / failed sealant"),
        option("flush", "沖水／供水問題", "Flush / water supply problem"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    second: {
      titleZh: "問題會唔會影響浴室使用？",
      titleEn: "Does it affect use of the bathroom?",
      options: [
        option("cannot-use", "而家用唔到", "Cannot use it"),
        option("limited", "可以用，但有限制", "Usable with limitations"),
        option("normal", "仍可正常使用", "Still usable"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    third: {
      titleZh: "有冇水流到浴室以外？",
      titleEn: "Is water reaching outside the bathroom?",
      options: [
        option("yes", "有", "Yes"),
        option("no", "冇", "No"),
        option("unsure", "唔肯定", "Not sure"),
      ],
    },
    // first ("你見到邊啲問題？"/"what problems can you see?": leak, slow/
    // blocked drain, loose fitting, mouldy sealant, flush/supply problem)
    // is the observable-symptom question — a leak AND mouldy sealant, or a
    // slow drain AND a loose fitting, are plausible real combinations.
    // Reworded from the original "主要見到咩問題？"/"What is the main
    // problem?" (singular "main"), which read oddly once multiple answers
    // became allowed — a Gate A polish item, not a functional change; the
    // option ids/values are untouched.
    symptomSlot: "first",
  },
};

function branchSteps(category: string): QuestionnaireStep[] {
  const branch = branches[category];
  const symptomFieldId = branch.symptomSlot === "first" ? "branchFirst" : "branchSecond";

  const buildBranchField = (
    fieldId: string,
    slot: "first" | "second" | "third",
    def: { titleZh: string; titleEn: string; options: QuestionnaireOption[]; safetyRule?: SafetyRule },
  ): QuestionnaireField =>
    branch.symptomSlot === slot
      ? multiSelect(fieldId, def.titleZh, def.titleEn, def.options, def.safetyRule)
      : select(fieldId, def.titleZh, def.titleEn, def.options, true, def.safetyRule, "pill");

  return [
    step(
      "affected",
      "受影響位置",
      "WHAT IS AFFECTED",
      branch.affected.titleZh,
      branch.affected.titleEn,
      [select("affected", branch.affected.titleZh, branch.affected.titleEn, branch.affected.options, true, undefined, "grid")],
      "揀你實際見到嘅一項，唔使推斷問題源頭。",
      "Choose what you can actually see. You do not need to infer the source.",
    ),
    step(
      "branch",
      "你見到嘅事實",
      "WHAT YOU CAN OBSERVE",
      "再講三個簡單情況。",
      "Three quick facts about the problem.",
      [
        buildBranchField("branchFirst", "first", branch.first),
        buildBranchField("branchSecond", "second", branch.second),
        buildBranchField("branchThird", "third", branch.third),
        // Companion free-text field for the symptom question's "Other"
        // option — visible only once "other" is among the current
        // selections (questionnaireFieldIsVisible handles a multi_select
        // source field's array value), and automatically cleared by
        // QuestionnaireEngine's existing changeResponse cleanup the moment
        // "other" is deselected, the same mechanism priorDetail/
        // evidenceKind already rely on.
        {
          ...text(
            "symptomOther",
            "其他情況",
            "Other observation",
            "簡單講低你見到嘅情況",
            "Briefly describe what you are seeing",
            true,
            true,
          ),
          showWhen: { fieldId: symptomFieldId, equals: SYMPTOM_OTHER_VALUE },
        },
      ],
      "揀最貼近嘅答案；其中一題可以揀多過一項，「唔肯定」都係有效答案。",
      "Choose the closest answer for each. One of them lets you select more than one — “Not sure” is also a valid answer.",
    ),
  ];
}

const otherDetailStep = step(
  "other-detail",
  "用你自己嘅說話",
  "IN YOUR OWN WORDS",
  "簡單講吓你見到咩情況？",
  "Briefly tell us what you can see.",
  [
    text(
      "otherDetail",
      "情況描述",
      "Description",
      "例如：露台趟門個轆好似卡住，推唔郁……",
      "For example: The balcony sliding door is stuck and will not move…",
      true,
      true,
    ),
  ],
  "幾個字都可以。講低受影響嘅物件、位置，或者發生緊咩事。",
  "A short note is enough. Mention the item, location or what is happening.",
);

function buildSchema(category: RepairCategoryId, label: [string, string]): QuestionnaireSchema {
  const categorySteps =
    category === "other" || category === "unsure"
      ? [otherDetailStep]
      : branchSteps(category);
  return {
    category,
    label: lt(label[0], label[1]),
    shortLabel: lt(label[0], label[1]),
    description: lt("", ""),
    steps: [...categorySteps, safetyStep, ...sharedTail],
    version: CURRENT_SCHEMA_VERSION,
  };
}

export const questionnaireSchemas: QuestionnaireSchema[] = [
  buildSchema("leak", ["滲水／漏水", "Water seepage / leakage"]),
  buildSchema("drainage", ["去水／渠務問題", "Drainage problem"]),
  buildSchema("plumbing", ["水喉問題", "Plumbing problem"]),
  buildSchema("electrical", ["電力／跳掣／冇電", "Electrical / power problem"]),
  buildSchema("aircon", ["冷氣問題", "Air-conditioning problem"]),
  buildSchema("door-window", ["門窗問題", "Door / window problem"]),
  buildSchema("surface", ["牆身／天花／地板損壞", "Wall / ceiling / floor damage"]),
  buildSchema("bathroom", ["浴室／潔具問題", "Bathroom / sanitary fixture problem"]),
  buildSchema("other", ["其他維修", "Other repair"]),
  buildSchema("unsure", ["唔肯定", "Not sure"]),
];

export const questionnaireByCategory = Object.fromEntries(
  questionnaireSchemas.map((schema) => [schema.category, schema]),
) as Record<RepairCategoryId, QuestionnaireSchema>;

/**
 * The questionnaire_version persisted on a RepairSubmission — derived from
 * the actual schema (steps/fields/safety rules) that produced the answers,
 * so a persisted value always matches the schema that generated it.
 */
export function questionnaireVersionLabel(category: RepairCategoryId): string {
  return `v${questionnaireByCategory[category].version}`;
}

// ---------------------------------------------------------------------------
// Four visible macro stages (approved Sites design) spanning the whole
// intake journey, not just the questionnaire — the owner-facing experience
// must read as "which of 4 stages am I in", not as the raw N-of-11 step
// counter QuestionnaireEngine tracks internally for its own progression
// logic. This is presentation only: QuestionnaireEngine remains the single
// schema-driven step engine (no second state machine) — intakeStageForStep
// just labels its existing step ids with which macro stage they belong to.
// The fourth stage (contact/submit) lives outside QuestionnaireEngine
// entirely, in RepairSubmissionPanel.
// ---------------------------------------------------------------------------

export const intakeStages: { label: LocalizedText }[] = [
  { label: lt("講低情況", "Tell us what happened") },
  { label: lt("補充資料", "Add useful detail") },
  { label: lt("物業資料及整理", "Property details & review") },
  { label: lt("聯絡及提交", "Contact & submit") },
];

// Fixed shared-tail step ids mapped to their macro stage index (0-based,
// matching intakeStages). Anything not listed here — the category-specific
// "affected"/"branch" step(s) for a standard category, or "other-detail"
// for other/unsure — is the always-first stage-0 step, so it needs no
// explicit entry.
const STEP_STAGE_INDEX: Record<string, number> = {
  safety: 0,
  timeline: 0,
  prior: 1,
  evidence: 1,
  building: 1,
  access: 2,
  address: 2,
  relationship: 2,
  // "additional" is the true final step (see sharedTail's own order) — it
  // must map to the same last in-questionnaire stage as access/address/
  // relationship, not stage 1, or the indicator would appear to move
  // backwards on the questionnaire's very last step.
  additional: 2,
};

/** 0-indexed macro stage (see intakeStages) that a given step id belongs to. */
export function intakeStageForStep(stepId: string): number {
  return STEP_STAGE_INDEX[stepId] ?? 0;
}

/**
 * Resolves a raw stored answer (e.g. "quote", "ceiling") back to its
 * bilingual label via the category's own schema — used by
 * GeneratedBriefDocument so the same stored brief renders correctly in
 * either language without regenerating. Falls back to a truthful "Not
 * specified" rather than the raw slug when the field/value cannot be
 * resolved (a genuinely missing answer, not an invented one).
 */
const NOT_SPECIFIED = { zh: "未提供", en: "Not specified" };

/**
 * Resolves a raw stored answer (e.g. "quote", "ceiling") back to its
 * bilingual label. Never falls back to the raw internal value — a value
 * that cannot be matched against the category's own schema options is
 * treated the same as a missing value (a truthful "Not specified"), since
 * an unresolved code (e.g. "owner", "daily") is not something a customer
 * should ever see.
 */
export function resolveAnswerLabel(
  category: RepairCategoryId,
  fieldId: string,
  value: string | undefined,
  lang: "zh" | "en",
): string {
  if (!value) return NOT_SPECIFIED[lang];
  const schema = questionnaireByCategory[category];
  for (const step of schema.steps) {
    const field = step.fields.find((candidate) => candidate.id === fieldId);
    if (!field?.options) continue;
    const match = field.options.find((option) => option.value === value);
    return match ? (lang === "zh" ? match.label.zh : match.label.en) : NOT_SPECIFIED[lang];
  }
  return NOT_SPECIFIED[lang];
}

/**
 * Same resolution as resolveAnswerLabel, but for a field that may now hold
 * more than one selection (a category's multi_select observable-symptom
 * field — see the branches map's own symptomSlot) — accepts either a
 * scalar (a single_select field, or an older schema-v2-and-earlier
 * submission's stored value, from before this field became multi_select)
 * or an array, and always returns an array of resolved labels. A bare
 * scalar is treated as a one-item selection, so a pre-v3 submission renders
 * identically to how it always did.
 *
 * Ordering is always the field's OWN option-array order, never click/
 * insertion order — the same selected symptoms must read in the same
 * order everywhere they are shown (owner review, generated brief,
 * confirmation, operator rendering). An unrecognised value is silently
 * dropped (same "never leak a raw code" rule as resolveAnswerLabel), not
 * substituted with a placeholder — a genuinely unresolvable entry does not
 * shrink the count of what to expect from an otherwise-valid selection the
 * way "Not specified" would if it stood in for it.
 *
 * For a multi_select field, `value` also goes through
 * normaliseMultiSelectValue (domain/rules.ts) before resolving: this is the
 * render-time half of the same fail-closed rule sanitiseResponses applies
 * at restoration and buildRepairBrief applies at brief generation — a
 * contradictory stored value (the field's exclusiveValue, e.g. "unsure",
 * alongside a real selection, which can only reach this function via a
 * historical/hand-edited record that predates or bypassed those two
 * boundaries) renders as nothing rather than the contradictory content
 * itself, in every caller of this function (owner review, generated brief,
 * confirmation, operator rendering) at once.
 */
export function resolveAnswerLabels(
  category: RepairCategoryId,
  fieldId: string,
  value: string | string[] | undefined,
  lang: "zh" | "en",
): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  if (raw.length === 0) return [];
  const schema = questionnaireByCategory[category];
  for (const step of schema.steps) {
    const field = step.fields.find((candidate) => candidate.id === fieldId);
    if (!field?.options) continue;
    const normalisedRaw = field.type === "multi_select" ? normaliseMultiSelectValue(field, raw) : raw;
    if (!normalisedRaw) return [];
    return field.options
      .filter((option) => normalisedRaw.includes(option.value))
      .map((option) => (lang === "zh" ? option.label.zh : option.label.en));
  }
  return [];
}

/**
 * The question/field text itself (e.g. "Can the water be isolated?"), not
 * an answer — used to give a bare resolved value like "Yes"/"No" its
 * question context in the generated brief (see domain/brief.ts's
 * summariseObservedFacts), since "Yes" alone is ambiguous but "Can the
 * water be isolated?: Yes" is not. Returns undefined if this schema has no
 * field with this id.
 */
export function questionnaireFieldLabel(
  category: RepairCategoryId,
  fieldId: string,
  lang: "zh" | "en",
): string | undefined {
  const schema = questionnaireByCategory[category];
  for (const step of schema.steps) {
    const field = step.fields.find((candidate) => candidate.id === fieldId);
    if (field) return lang === "zh" ? field.label.zh : field.label.en;
  }
  return undefined;
}
