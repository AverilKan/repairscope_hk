export type Currency = "GBP";

export type Money = {
  amountMinor: number;
  currency: Currency;
};

export type VATMode =
  | "not_charged"
  | "included"
  | "added"
  | "not_stated";

export type VAT = {
  mode: VATMode;
  rateBasisPoints?: number;
  amount?: Money;
};

const assertMoney = (money: Money) => {
  if (!Number.isSafeInteger(money.amountMinor)) {
    throw new Error("Money must use safe integer minor units.");
  }
  if (money.currency !== "GBP") {
    throw new Error("RepairScope currently supports GBP only.");
  }
};

export function money(amountMinor: number): Money {
  const value = { amountMinor: Math.round(amountMinor), currency: "GBP" as const };
  assertMoney(value);
  return value;
}

export function moneyFromMajor(amountMajor: number): Money {
  if (!Number.isFinite(amountMajor)) {
    throw new Error("Money amount must be finite.");
  }
  return money(Math.round(amountMajor * 100));
}

export function moneyToMajor(value: Money): number {
  assertMoney(value);
  return value.amountMinor / 100;
}

export function formatMoney(
  value: Money,
  options?: { alwaysShowPence?: boolean },
): string {
  assertMoney(value);
  const amount = moneyToMajor(value);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: value.currency,
    minimumFractionDigits:
      options?.alwaysShowPence || value.amountMinor % 100 !== 0 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function addMoney(values: Money[]): Money {
  if (!values.length) return money(0);
  const currency = values[0].currency;
  if (values.some((value) => value.currency !== currency)) {
    throw new Error("Cannot add values in different currencies.");
  }
  return money(
    values.reduce((total, value) => {
      assertMoney(value);
      return total + value.amountMinor;
    }, 0),
  );
}

export function subtractMoney(left: Money, right: Money): Money {
  if (left.currency !== right.currency) {
    throw new Error("Cannot subtract values in different currencies.");
  }
  return money(left.amountMinor - right.amountMinor);
}

export function moneyEquals(left: Money, right: Money): boolean {
  return (
    left.currency === right.currency &&
    left.amountMinor === right.amountMinor
  );
}

export function calculateVatAdded(
  subtotal: Money,
  rateBasisPoints: number,
): Money {
  assertMoney(subtotal);
  if (!Number.isSafeInteger(rateBasisPoints) || rateBasisPoints < 0) {
    throw new Error("VAT rate must be non-negative integer basis points.");
  }
  return money(Math.round((subtotal.amountMinor * rateBasisPoints) / 10_000));
}

export function calculateEmbeddedVat(
  total: Money,
  rateBasisPoints: number,
): Money {
  assertMoney(total);
  if (!Number.isSafeInteger(rateBasisPoints) || rateBasisPoints < 0) {
    throw new Error("VAT rate must be non-negative integer basis points.");
  }
  if (rateBasisPoints === 0) return money(0);
  return money(
    Math.round(
      (total.amountMinor * rateBasisPoints) / (10_000 + rateBasisPoints),
    ),
  );
}

