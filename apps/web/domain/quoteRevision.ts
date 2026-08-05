import {
  calculateContractorQuote,
  contractorMaterialsTotal,
  createSubmittedRepairQuote,
} from "./contractorQuote";
import type {
  RepairQuoteResponseDraft,
  SubmittedContractorResponse,
  SubmittedRepairQuote,
} from "./types";
import {
  formatMoney as formatCanonicalMoney,
  moneyEquals,
} from "./money";

export type QuoteRevisionSection =
  | "work"
  | "costs"
  | "materials"
  | "charges"
  | "exclusions"
  | "price"
  | "availability"
  | "duration"
  | "guarantee"
  | "vat"
  | "validity"
  | "documents";

export type QuoteFieldChange = {
  field: QuoteRevisionSection | "total";
  label: string;
  before: string;
  after: string;
  summary: string;
};

export type ProposalRevisionDraft = {
  sourceResponseId: string;
  sourceVersion: number;
  draftVersion: number;
  quote: RepairQuoteResponseDraft;
  changedFields: QuoteFieldChange[];
  lastSavedAt?: string;
};

const money = (amount: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);

const list = (items: string[]) => items.filter(Boolean).join(", ") || "Not stated";

const workLabel = (quote: RepairQuoteResponseDraft) =>
  list(quote.workItems.map((item) => item.label));

const materialsLabel = (quote: RepairQuoteResponseDraft) =>
  list([
    ...quote.mainMaterials.filter((item) => item !== "Something else"),
    quote.customMaterial,
  ]);

const chargesLabel = (quote: RepairQuoteResponseDraft) =>
  quote.extraCharges.length
    ? quote.extraCharges
        .map((charge) => `${charge.label || "Other cost"} ${money(Number(charge.amount || 0))}`)
        .join(", ")
    : "No additional charges";

const exclusionsLabel = (quote: RepairQuoteResponseDraft) =>
  list([
    ...quote.exclusions.filter((item) => item !== "Something else"),
    quote.otherExclusion,
  ]);

const priceLabel = (quote: RepairQuoteResponseDraft) => {
  const status =
    quote.priceStatus === "fixed"
      ? "Fixed price"
      : quote.priceStatus === "estimate"
        ? "Estimate"
        : quote.priceStatus === "may_change"
          ? "Price may change"
          : "Not stated";
  const reasons = list([
    ...quote.priceChangeReasons.filter((item) => item !== "Something else"),
    quote.otherPriceChangeReason,
    quote.priceChangeNote,
  ]);
  return quote.priceStatus === "fixed" ? status : `${status} · ${reasons}`;
};

const availabilityLabel = (quote: RepairQuoteResponseDraft) =>
  quote.startAvailability === "Later"
    ? quote.laterStartDate || "Not stated"
    : quote.startAvailability || "Not stated";

const guaranteeLabel = (quote: RepairQuoteResponseDraft) => {
  if (quote.guaranteePosition === "yes") {
    return list([quote.guaranteeDuration, quote.guaranteeNote]);
  }
  if (quote.guaranteePosition === "no") return "No warranty";
  if (quote.guaranteePosition === "not_applicable") return "Not applicable";
  return "Not stated";
};

const vatLabel = (quote: RepairQuoteResponseDraft) => {
  const totals = calculateContractorQuote(quote);
  if (totals.vatMode === "not_charged") return "Not VAT registered";
  return `${totals.vatRate}% VAT ${totals.vatMode === "included" ? "included" : "added"}`;
};

const documentsLabel = (quote: RepairQuoteResponseDraft) =>
  quote.supportingAttachments?.length
    ? quote.supportingAttachments.map((item) => item.name).join(", ")
    : "No supporting document";

export function quoteDraftFromSubmitted(
  submitted: SubmittedRepairQuote,
): RepairQuoteResponseDraft {
  return {
    workItems: structuredClone(submitted.workItems),
    labourAmount: submitted.labourAmount,
    materialsAmount: submitted.materialsAmount,
    mainMaterials: [...submitted.mainMaterials],
    customMaterial: submitted.customMaterial,
    materialsStatus: submitted.materialsStatus,
    itemiseMaterials: submitted.itemiseMaterials,
    materialCostItems: structuredClone(submitted.materialCostItems),
    otherChargesReviewed: submitted.otherChargesReviewed,
    extraCharges: structuredClone(submitted.extraCharges),
    exclusions: [...submitted.exclusions],
    otherExclusion: submitted.otherExclusion,
    priceStatus: submitted.priceStatus,
    priceChangeReasons: [...submitted.priceChangeReasons],
    otherPriceChangeReason: submitted.otherPriceChangeReason,
    priceChangeNote: submitted.priceChangeNote,
    startAvailability: submitted.startAvailability,
    laterStartDate: submitted.laterStartDate,
    duration: submitted.duration,
    guaranteePosition: submitted.guaranteePosition,
    guaranteeDuration: submitted.guaranteeDuration,
    guaranteeNote: submitted.guaranteeNote,
    vatRegistered: submitted.vatRegistered,
    vatIncluded: submitted.vatIncluded,
    vatRate: submitted.vatRate,
    customVatRate: submitted.customVatRate,
    quoteValidity: submitted.quoteValidity ?? "",
    supportingAttachments: structuredClone(
      submitted.supportingAttachments ?? [],
    ),
  };
}

export function createProposalRevisionDraft(
  response: SubmittedContractorResponse,
): ProposalRevisionDraft {
  if (response.responseType !== "repair_quote") {
    throw new Error("Only a repair quote can be revised.");
  }
  return {
    sourceResponseId: response.responseId,
    sourceVersion: response.version,
    draftVersion: response.version + 1,
    quote: quoteDraftFromSubmitted(
      response.submittedData as SubmittedRepairQuote,
    ),
    changedFields: [],
  };
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function detectQuoteFieldChanges(
  original: SubmittedRepairQuote,
  draft: RepairQuoteResponseDraft,
): QuoteFieldChange[] {
  const changes: QuoteFieldChange[] = [];
  const add = (
    field: QuoteFieldChange["field"],
    label: string,
    before: string,
    after: string,
    summary: string,
  ) => changes.push({ field, label, before, after, summary });

  if (!same(original.workItems, draft.workItems)) {
    add("work", "Work included", workLabel(original), workLabel(draft), "Work scope updated");
  }
  if (original.labourAmount !== draft.labourAmount) {
    add(
      "costs",
      "Labour",
      money(Number(original.labourAmount || 0)),
      money(Number(draft.labourAmount || 0)),
      "Labour cost updated",
    );
  }
  if (
    original.materialsAmount !== draft.materialsAmount ||
    original.itemiseMaterials !== draft.itemiseMaterials ||
    !same(original.materialCostItems, draft.materialCostItems)
  ) {
    add(
      "costs",
      "Materials cost",
      money(contractorMaterialsTotal(original)),
      money(contractorMaterialsTotal(draft)),
      "Materials cost updated",
    );
  }
  if (
    !same(original.mainMaterials, draft.mainMaterials) ||
    original.customMaterial !== draft.customMaterial ||
    original.materialsStatus !== draft.materialsStatus
  ) {
    add(
      "materials",
      "Material details",
      materialsLabel(original),
      materialsLabel(draft),
      "Material details updated",
    );
  }
  if (!same(original.extraCharges, draft.extraCharges)) {
    add(
      "charges",
      "Additional charges",
      chargesLabel(original),
      chargesLabel(draft),
      "Additional charges updated",
    );
  }
  if (
    !same(original.exclusions, draft.exclusions) ||
    original.otherExclusion !== draft.otherExclusion
  ) {
    add(
      "exclusions",
      "Exclusions",
      exclusionsLabel(original),
      exclusionsLabel(draft),
      "Exclusions updated",
    );
  }
  if (
    original.priceStatus !== draft.priceStatus ||
    !same(original.priceChangeReasons, draft.priceChangeReasons) ||
    original.otherPriceChangeReason !== draft.otherPriceChangeReason ||
    original.priceChangeNote !== draft.priceChangeNote
  ) {
    add(
      "price",
      "Price status",
      priceLabel(original),
      priceLabel(draft),
      "Price conditions updated",
    );
  }
  if (
    original.startAvailability !== draft.startAvailability ||
    original.laterStartDate !== draft.laterStartDate
  ) {
    add(
      "availability",
      "Availability",
      availabilityLabel(original),
      availabilityLabel(draft),
      "Availability updated",
    );
  }
  if (original.duration !== draft.duration) {
    add(
      "duration",
      "Duration",
      original.duration || "Not stated",
      draft.duration || "Not stated",
      original.duration ? "Duration updated" : "Duration added",
    );
  }
  if (
    original.guaranteePosition !== draft.guaranteePosition ||
    original.guaranteeDuration !== draft.guaranteeDuration ||
    original.guaranteeNote !== draft.guaranteeNote
  ) {
    add(
      "guarantee",
      "Warranty",
      guaranteeLabel(original),
      guaranteeLabel(draft),
      original.guaranteePosition ? "Warranty updated" : "Warranty added",
    );
  }
  if (
    original.vatRegistered !== draft.vatRegistered ||
    original.vatIncluded !== draft.vatIncluded ||
    original.vatRate !== draft.vatRate ||
    original.customVatRate !== draft.customVatRate
  ) {
    add("vat", "VAT", vatLabel(original), vatLabel(draft), "VAT treatment updated");
  }
  if ((original.quoteValidity ?? "") !== (draft.quoteValidity ?? "")) {
    add(
      "validity",
      "Quote validity",
      original.quoteValidity || "Not stated",
      draft.quoteValidity || "Not stated",
      "Quote validity updated",
    );
  }
  if (!same(original.supportingAttachments ?? [], draft.supportingAttachments ?? [])) {
    add(
      "documents",
      "Supporting document",
      documentsLabel(original),
      documentsLabel(draft),
      "Supporting document updated",
    );
  }

  const originalTotal = original.finalTotal;
  const revisedTotal = createSubmittedRepairQuote(draft).finalTotal;
  if (!moneyEquals(originalTotal, revisedTotal)) {
    add(
      "total",
      "Total quote",
      formatCanonicalMoney(originalTotal),
      formatCanonicalMoney(revisedTotal),
      "Total price updated",
    );
  }
  return changes;
}

export function validateQuoteRevisionDraft(draft: RepairQuoteResponseDraft) {
  const totals = calculateContractorQuote(draft);
  const materialsRequired = totals.materials > 0;
  const customWorkValid = draft.workItems.every(
    (item) => item.label.trim().length >= 2,
  );
  const materialRowsValid =
    !draft.itemiseMaterials ||
    (draft.materialCostItems.length > 0 &&
      draft.materialCostItems.every(
        (item) => item.label.trim() && item.amount.trim(),
      ));
  const chargesValid =
    draft.otherChargesReviewed &&
    draft.extraCharges.every(
      (charge) =>
        charge.amount.trim() &&
        (charge.type !== "other" || charge.label.trim()),
    );
  const exclusionsValid =
    draft.exclusions.length > 0 &&
    (!draft.exclusions.includes("Something else") ||
      draft.otherExclusion.trim().length >= 2);
  const priceValid =
    Boolean(draft.priceStatus) &&
    (draft.priceStatus === "fixed" || draft.priceChangeReasons.length > 0) &&
    (!draft.priceChangeReasons.includes("Something else") ||
      draft.otherPriceChangeReason.trim().length >= 2);
  const availabilityValid =
    Boolean(draft.startAvailability) &&
    (draft.startAvailability !== "Later" || Boolean(draft.laterStartDate));
  const guaranteeValid =
    Boolean(draft.guaranteePosition) &&
    (draft.guaranteePosition !== "yes" ||
      Boolean(draft.guaranteeDuration));
  const vatValid =
    Boolean(draft.vatRegistered) &&
    (draft.vatRegistered === "no" ||
      (Boolean(draft.vatIncluded) &&
        Boolean(draft.vatRate) &&
        (draft.vatRate !== "other" ||
          Boolean(draft.customVatRate.trim()))));
  const valid =
    draft.workItems.length > 0 &&
    customWorkValid &&
    Boolean(draft.labourAmount.trim()) &&
    Boolean(draft.materialsAmount.trim()) &&
    (!materialsRequired ||
      (draft.mainMaterials.length > 0 && Boolean(draft.materialsStatus))) &&
    materialRowsValid &&
    chargesValid &&
    exclusionsValid &&
    priceValid &&
    availabilityValid &&
    Boolean(draft.duration) &&
    guaranteeValid &&
    vatValid &&
    Boolean(draft.quoteValidity?.trim()) &&
    totals.total >= 0;

  return {
    valid,
    totals,
    incompleteCustomCost:
      !materialRowsValid || !chargesValid || !customWorkValid,
  };
}

export function revisionSummary(changes: QuoteFieldChange[]) {
  const summaries = Array.from(
    new Set(
      changes
        .filter((change) => change.field !== "total")
        .map((change) => change.summary),
    ),
  );
  if (!summaries.length && changes.some((change) => change.field === "total")) {
    return "Total price updated.";
  }
  if (!summaries.length) return "Quote updated.";
  return `${summaries.join("; ")}.`;
}

export function sectionsForClarificationQuestions(
  issueKeys: string[],
  questions: string[],
): QuoteRevisionSection[] {
  const joined = `${issueKeys.join(" ")} ${questions.join(" ")}`.toLowerCase();
  const sections: QuoteRevisionSection[] = [];
  const add = (section: QuoteRevisionSection) => {
    if (!sections.includes(section)) sections.push(section);
  };
  if (/duration|how long|time needed/.test(joined)) add("duration");
  if (/warranty|guarantee/.test(joined)) add("guarantee");
  if (/cost|price|total|vat|labour|material/.test(joined)) add("costs");
  if (/exclusion|exclude|not included/.test(joined)) add("exclusions");
  if (/scope|work included|what work/.test(joined)) add("work");
  if (/start|available|availability/.test(joined)) add("availability");
  return sections;
}
