import type {
  InspectionResponseDraft,
  RepairQuoteResponseDraft,
  SubmittedInspectionRequest,
  SubmittedRepairQuote,
} from "./types";
import {
  addMoney,
  calculateEmbeddedVat,
  calculateVatAdded,
  money,
  moneyFromMajor,
  moneyToMajor,
  type VAT,
} from "./money";

export interface ContractorQuoteTotals {
  labour: number;
  materials: number;
  extras: number;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  vatMode: "not_charged" | "included" | "added";
}

const NOTHING_ELSE_EXCLUDED = "Nothing else is excluded";

export function parseQuoteAmount(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function toggleContractorExclusion(
  current: string[],
  option: string,
) {
  if (option === NOTHING_ELSE_EXCLUDED) {
    return current.includes(NOTHING_ELSE_EXCLUDED)
      ? []
      : [NOTHING_ELSE_EXCLUDED];
  }

  const withoutNothing = current.filter(
    (item) => item !== NOTHING_ELSE_EXCLUDED,
  );
  return withoutNothing.includes(option)
    ? withoutNothing.filter((item) => item !== option)
    : [...withoutNothing, option];
}

export function contractorMaterialsTotal(
  quote: RepairQuoteResponseDraft,
) {
  if (!quote.itemiseMaterials) return parseQuoteAmount(quote.materialsAmount);
  return quote.materialCostItems.reduce(
    (sum, item) => sum + parseQuoteAmount(item.amount),
    0,
  );
}

export function contractorVatRate(quote: RepairQuoteResponseDraft) {
  if (quote.vatRegistered !== "yes") return 0;
  const rawRate =
    quote.vatRate === "other" ? quote.customVatRate : quote.vatRate;
  const rate = Number(rawRate);
  return Number.isFinite(rate) && rate >= 0 ? rate : 0;
}

export function calculateContractorQuote(
  quote: RepairQuoteResponseDraft,
): ContractorQuoteTotals {
  const labourMoney = moneyFromMajor(parseQuoteAmount(quote.labourAmount));
  const materialsMoney = moneyFromMajor(contractorMaterialsTotal(quote));
  const extrasMoney = addMoney(
    quote.extraCharges.map((charge) =>
      moneyFromMajor(parseQuoteAmount(charge.amount)),
    ),
  );
  const subtotalMoney = addMoney([labourMoney, materialsMoney, extrasMoney]);
  const rateBasisPoints = Math.round(contractorVatRate(quote) * 100);
  const base = {
    labour: moneyToMajor(labourMoney),
    materials: moneyToMajor(materialsMoney),
    extras: moneyToMajor(extrasMoney),
    subtotal: moneyToMajor(subtotalMoney),
    vatRate: rateBasisPoints / 100,
  };

  if (quote.vatRegistered !== "yes") {
    return {
      ...base,
      vatAmount: 0,
      total: moneyToMajor(subtotalMoney),
      vatMode: "not_charged",
    };
  }

  if (quote.vatIncluded === "yes") {
    const vatAmount = calculateEmbeddedVat(subtotalMoney, rateBasisPoints);
    return {
      ...base,
      vatAmount: moneyToMajor(vatAmount),
      total: moneyToMajor(subtotalMoney),
      vatMode: "included",
    };
  }

  const vatAmount = calculateVatAdded(subtotalMoney, rateBasisPoints);
  return {
    ...base,
    vatAmount: moneyToMajor(vatAmount),
    total: moneyToMajor(addMoney([subtotalMoney, vatAmount])),
    vatMode: "added",
  };
}

export function createSubmittedRepairQuote(
  quote: RepairQuoteResponseDraft,
): SubmittedRepairQuote {
  const totals = calculateContractorQuote(quote);
  return {
    ...structuredClone(quote),
    costSnapshot: {
      labour: moneyFromMajor(totals.labour),
      materials: moneyFromMajor(totals.materials),
      extras: moneyFromMajor(totals.extras),
      subtotal: moneyFromMajor(totals.subtotal),
      vat: {
        mode: totals.vatMode,
        rateBasisPoints:
          totals.vatMode === "not_charged"
            ? undefined
            : Math.round(totals.vatRate * 100),
        amount: moneyFromMajor(totals.vatAmount),
      },
    },
    finalTotal: moneyFromMajor(totals.total),
  };
}

export function createSubmittedInspectionRequest(
  inspection: InspectionResponseDraft,
): SubmittedInspectionRequest {
  const enteredFee = moneyFromMajor(parseQuoteAmount(inspection.inspectionFee));
  const rateBasisPoints = 2000;
  const vat: VAT =
    inspection.vatTreatment === "included"
      ? {
          mode: "included",
          rateBasisPoints,
          amount: calculateEmbeddedVat(enteredFee, rateBasisPoints),
        }
      : inspection.vatTreatment === "added"
        ? {
            mode: "added",
            rateBasisPoints,
            amount: calculateVatAdded(enteredFee, rateBasisPoints),
          }
        : inspection.vatTreatment === "not_registered"
          ? { mode: "not_charged", amount: money(0) }
          : { mode: "not_stated" };
  const finalFee =
    vat.mode === "added" && vat.amount
      ? addMoney([enteredFee, vat.amount])
      : enteredFee;
  return {
    ...structuredClone(inspection),
    netFee:
      vat.mode === "included" && vat.amount
        ? money(enteredFee.amountMinor - vat.amount.amountMinor)
        : enteredFee,
    vat,
    finalFee,
  };
}
