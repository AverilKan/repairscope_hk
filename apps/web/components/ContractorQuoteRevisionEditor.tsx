"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  calculateContractorQuote,
  contractorMaterialsTotal,
  toggleContractorExclusion,
} from "@/domain/contractorQuote";
import {
  sectionsForClarificationQuestions,
  type QuoteFieldChange,
  type QuoteRevisionSection,
} from "@/domain/quoteRevision";
import type {
  ContractorExtraCharge,
  RepairQuoteResponseDraft,
} from "@/domain/types";

const money = (amount: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);

const materialOptions = [
  "Replacement socket fittings",
  "Back boxes",
  "Cable or wiring",
  "Fixings and small materials",
  "Stain block",
  "White ceiling paint",
];

const exclusionOptions = [
  "Repairing plaster, walls or paint afterwards",
  "Hidden damage found after work starts",
  "Additional faults not described in the job",
  "Scaffolding or specialist access",
  "Moving furniture or stored belongings",
  "Nothing else is excluded",
  "Something else",
];

const priceReasonOptions = [
  "Hidden damage found after work starts",
  "More faults are found",
  "More parts or materials are needed",
  "Access is harder than expected",
  "The existing work is unsafe or unsuitable",
  "Extra work is requested",
  "Something else",
];

const chargeOptions: Array<[ContractorExtraCharge["type"], string]> = [
  ["testing", "Testing or certificate"],
  ["callout", "Call-out"],
  ["waste", "Waste removal"],
  ["making_good", "Repairing plaster, walls or paint"],
  ["access", "Scaffolding or access equipment"],
  ["parking", "Parking or permits"],
  ["other", "Other cost"],
];

const sectionLabels: Record<QuoteRevisionSection, string> = {
  work: "Work included",
  costs: "Costs",
  materials: "Materials",
  charges: "Additional charges",
  exclusions: "Exclusions",
  price: "Price status",
  availability: "Availability",
  duration: "Duration",
  guarantee: "Warranty",
  vat: "VAT",
  validity: "Quote validity",
  documents: "Supporting document",
};

const allSections: QuoteRevisionSection[] = [
  "work",
  "costs",
  "materials",
  "charges",
  "exclusions",
  "price",
  "availability",
  "duration",
  "guarantee",
  "vat",
  "validity",
  "documents",
];

function CheckboxGrid({
  legend,
  options,
  values,
  onChange,
}: {
  legend: string;
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset className="contractor-fieldset">
      <legend>{legend}</legend>
      <div className="contractor-option-grid">
        {options.map((option) => {
          const checked = values.includes(option);
          return (
            <label
              className={`contractor-option ${
                checked ? "contractor-option--selected" : ""
              }`}
              key={option}
            >
              <input
                checked={checked}
                onChange={() =>
                  onChange(
                    checked
                      ? values.filter((value) => value !== option)
                      : [...values, option],
                  )
                }
                type="checkbox"
              />
              <span>{option}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function MoneyInput({
  id,
  label,
  value,
  readOnly = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="quote-money-input" htmlFor={id}>
      <span>{label}</span>
      <span className="money-field">
        <span aria-hidden="true">£</span>
        <input
          id={id}
          inputMode="decimal"
          min="0"
          onChange={(event) => onChange(event.target.value)}
          readOnly={readOnly}
          step="0.01"
          type="number"
          value={value}
        />
      </span>
    </label>
  );
}

function RevisionSection({
  section,
  summary,
  highlighted,
  open,
  onToggle,
  children,
}: {
  section: QuoteRevisionSection;
  summary: string;
  highlighted: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className={`quote-revision-section ${
        highlighted ? "quote-revision-section--highlighted" : ""
      }`}
      id={`quote-revision-${section}`}
    >
      <button
        aria-expanded={open}
        className="quote-revision-section__summary"
        onClick={onToggle}
        type="button"
      >
        <span>
          <strong>{sectionLabels[section]}</strong>
          <small>{summary || "Not stated"}</small>
          {highlighted && <em>Landlord asked about this</em>}
        </span>
        <span>{open ? "Close" : summary ? "Edit" : `Add ${sectionLabels[section].toLowerCase()}`}</span>
      </button>
      {open && <div className="quote-revision-section__fields">{children}</div>}
    </section>
  );
}

function sectionSummary(
  section: QuoteRevisionSection,
  quote: RepairQuoteResponseDraft,
) {
  const totals = calculateContractorQuote(quote);
  if (section === "work") {
    return `${quote.workItems.length} ${
      quote.workItems.length === 1 ? "work item" : "work items"
    }`;
  }
  if (section === "costs") {
    return `Labour ${money(totals.labour)} · Materials ${money(totals.materials)}`;
  }
  if (section === "materials") {
    return [
      ...quote.mainMaterials.filter((item) => item !== "Something else"),
      quote.customMaterial,
    ]
      .filter(Boolean)
      .join(", ");
  }
  if (section === "charges") {
    return quote.extraCharges.length
      ? `${quote.extraCharges.length} separate ${
          quote.extraCharges.length === 1 ? "charge" : "charges"
        } · ${money(totals.extras)}`
      : "No additional charges";
  }
  if (section === "exclusions") {
    return [
      ...quote.exclusions.filter((item) => item !== "Something else"),
      quote.otherExclusion,
    ]
      .filter(Boolean)
      .join(", ");
  }
  if (section === "price") {
    return quote.priceStatus === "fixed"
      ? "Fixed price"
      : quote.priceStatus === "estimate"
        ? "Estimate"
        : quote.priceStatus === "may_change"
          ? "Price may change"
          : "";
  }
  if (section === "availability") {
    return quote.startAvailability === "Later"
      ? quote.laterStartDate
      : quote.startAvailability;
  }
  if (section === "duration") return quote.duration;
  if (section === "guarantee") {
    if (quote.guaranteePosition === "yes") {
      return `Included · ${quote.guaranteeDuration || "duration not stated"}`;
    }
    if (quote.guaranteePosition === "no") return "No warranty";
    if (quote.guaranteePosition === "not_applicable") return "Not applicable";
    return "";
  }
  if (section === "vat") {
    if (quote.vatRegistered === "no") return "Not VAT registered";
    if (quote.vatRegistered === "yes") {
      return `${quote.vatRate === "other" ? quote.customVatRate : quote.vatRate}% VAT ${
        quote.vatIncluded === "yes" ? "included" : "added"
      }`;
    }
    return "";
  }
  if (section === "validity") return quote.quoteValidity ?? "";
  return quote.supportingAttachments?.length
    ? quote.supportingAttachments.map((item) => item.name).join(", ")
    : "No supporting document";
}

export function ContractorQuoteRevisionEditor({
  quote,
  landlordQuestions,
  highlightedSections,
  saveState,
  onChange,
}: {
  quote: RepairQuoteResponseDraft;
  landlordQuestions: string[];
  highlightedSections: QuoteRevisionSection[];
  saveState: "saved" | "saving" | "error";
  onChange: (quote: RepairQuoteResponseDraft) => void;
}) {
  const [openSection, setOpenSection] = useState<QuoteRevisionSection | null>(
    highlightedSections[0] ?? null,
  );
  const [customWork, setCustomWork] = useState("");
  const totals = calculateContractorQuote(quote);
  const orderedSections = useMemo(
    () => [
      ...highlightedSections,
      ...allSections.filter((section) => !highlightedSections.includes(section)),
    ],
    [highlightedSections],
  );

  const update = (patch: Partial<RepairQuoteResponseDraft>) =>
    onChange({ ...quote, ...patch });

  const openAndScroll = (section: QuoteRevisionSection) => {
    setOpenSection(section);
    window.requestAnimationFrame(() =>
      document
        .getElementById(`quote-revision-${section}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  const renderFields = (section: QuoteRevisionSection) => {
    if (section === "work") {
      return (
        <>
          <div className="selected-work-items">
            {quote.workItems.map((item, index) => (
              <div className="editable-work-item" key={item.id}>
                <input
                  aria-label={`Work item ${index + 1}`}
                  onChange={(event) =>
                    update({
                      workItems: quote.workItems.map((current) =>
                        current.id === item.id
                          ? { ...current, label: event.target.value }
                          : current,
                      ),
                    })
                  }
                  value={item.label}
                />
                <div>
                  <button
                    className="text-button"
                    onClick={() =>
                      update({
                        workItems: quote.workItems.filter(
                          (current) => current.id !== item.id,
                        ),
                      })
                    }
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="custom-work-item">
            <label htmlFor="revision-custom-work">Add another work item</label>
            <div>
              <input
                id="revision-custom-work"
                onChange={(event) => setCustomWork(event.target.value)}
                value={customWork}
              />
              <button
                className="button button--secondary"
                disabled={customWork.trim().length < 2}
                onClick={() => {
                  update({
                    workItems: [
                      ...quote.workItems,
                      {
                        id: `revision-work-${quote.workItems.length + 1}`,
                        label: customWork.trim(),
                      },
                    ],
                  });
                  setCustomWork("");
                }}
                type="button"
              >
                Add work item
              </button>
            </div>
          </div>
        </>
      );
    }

    if (section === "costs") {
      return (
        <>
          <div className="quote-main-costs">
            <MoneyInput
              id="revision-labour"
              label="Labour"
              onChange={(labourAmount) => update({ labourAmount })}
              value={quote.labourAmount}
            />
            <MoneyInput
              id="revision-materials"
              label="Materials"
              onChange={(materialsAmount) => update({ materialsAmount })}
              readOnly={quote.itemiseMaterials}
              value={
                quote.itemiseMaterials
                  ? contractorMaterialsTotal(quote).toFixed(2)
                  : quote.materialsAmount
              }
            />
          </div>
          <button
            aria-expanded={quote.itemiseMaterials}
            className="quote-optional-toggle"
            onClick={() =>
              update({
                itemiseMaterials: !quote.itemiseMaterials,
                materialCostItems:
                  !quote.itemiseMaterials && !quote.materialCostItems.length
                    ? [
                        {
                          id: "revision-material-1",
                          label: "",
                          quantity: "",
                          amount: "",
                          status: "confirmed",
                        },
                      ]
                    : quote.materialCostItems,
              })
            }
            type="button"
          >
            {quote.itemiseMaterials
              ? "Use one combined materials cost"
              : "List individual material costs — optional"}
          </button>
          {quote.itemiseMaterials && (
            <div className="material-cost-rows">
              {quote.materialCostItems.map((item, index) => (
                <div className="material-cost-row" key={item.id}>
                  <label>
                    <span>Material or group</span>
                    <input
                      onChange={(event) =>
                        update({
                          materialCostItems: quote.materialCostItems.map(
                            (current) =>
                              current.id === item.id
                                ? { ...current, label: event.target.value }
                                : current,
                          ),
                        })
                      }
                      value={item.label}
                    />
                  </label>
                  <label>
                    <span>Quantity — optional</span>
                    <input
                      onChange={(event) =>
                        update({
                          materialCostItems: quote.materialCostItems.map(
                            (current) =>
                              current.id === item.id
                                ? { ...current, quantity: event.target.value }
                                : current,
                          ),
                        })
                      }
                      value={item.quantity}
                    />
                  </label>
                  <MoneyInput
                    id={`revision-material-amount-${index}`}
                    label="Amount"
                    onChange={(amount) =>
                      update({
                        materialCostItems: quote.materialCostItems.map(
                          (current) =>
                            current.id === item.id
                              ? { ...current, amount }
                              : current,
                        ),
                      })
                    }
                    value={item.amount}
                  />
                  <label>
                    <span>Cost status</span>
                    <select
                      onChange={(event) =>
                        update({
                          materialCostItems: quote.materialCostItems.map(
                            (current) =>
                              current.id === item.id
                                ? {
                                    ...current,
                                    status: event.target.value as
                                      | "confirmed"
                                      | "estimated"
                                      | "to_confirm",
                                  }
                                : current,
                          ),
                        })
                      }
                      value={item.status}
                    >
                      <option value="confirmed">Confirmed</option>
                      <option value="estimated">Estimated</option>
                      <option value="to_confirm">To be confirmed</option>
                    </select>
                  </label>
                  <button
                    className="text-button"
                    onClick={() =>
                      update({
                        materialCostItems: quote.materialCostItems.filter(
                          (current) => current.id !== item.id,
                        ),
                      })
                    }
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                className="button button--secondary"
                onClick={() =>
                  update({
                    materialCostItems: [
                      ...quote.materialCostItems,
                      {
                        id: `revision-material-${quote.materialCostItems.length + 1}`,
                        label: "",
                        quantity: "",
                        amount: "",
                        status: "confirmed",
                      },
                    ],
                  })
                }
                type="button"
              >
                Add material row
              </button>
            </div>
          )}
        </>
      );
    }

    if (section === "materials") {
      return (
        <>
          <CheckboxGrid
            legend="What are the main materials?"
            onChange={(mainMaterials) => update({ mainMaterials })}
            options={Array.from(
              new Set([
                ...quote.mainMaterials.filter(
                  (item) => item !== "Something else",
                ),
                ...materialOptions,
                "Something else",
              ]),
            )}
            values={quote.mainMaterials}
          />
          {quote.mainMaterials.includes("Something else") && (
            <label className="contractor-inline-field">
              <span>Add another material</span>
              <input
                onChange={(event) =>
                  update({ customMaterial: event.target.value })
                }
                value={quote.customMaterial}
              />
            </label>
          )}
          <label className="contractor-inline-field">
            <span>Materials cost status</span>
            <select
              onChange={(event) =>
                update({
                  materialsStatus: event.target.value as
                    | "confirmed"
                    | "estimated"
                    | "to_confirm",
                })
              }
              value={quote.materialsStatus}
            >
              <option value="">Choose status</option>
              <option value="confirmed">Confirmed</option>
              <option value="estimated">Estimated</option>
              <option value="to_confirm">To be confirmed after attending</option>
            </select>
          </label>
        </>
      );
    }

    if (section === "charges") {
      return (
        <>
          {quote.extraCharges.map((charge, index) => (
            <div className="extra-charge-row" key={charge.id}>
              <label>
                <span>Charge type</span>
                <select
                  onChange={(event) =>
                    update({
                      extraCharges: quote.extraCharges.map((current) =>
                        current.id === charge.id
                          ? {
                              ...current,
                              type: event.target.value as ContractorExtraCharge["type"],
                            }
                          : current,
                      ),
                    })
                  }
                  value={charge.type}
                >
                  {chargeOptions.map(([type, label]) => (
                    <option key={type} value={type}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Short label</span>
                <input
                  onChange={(event) =>
                    update({
                      extraCharges: quote.extraCharges.map((current) =>
                        current.id === charge.id
                          ? { ...current, label: event.target.value }
                          : current,
                      ),
                    })
                  }
                  value={charge.label}
                />
              </label>
              <MoneyInput
                id={`revision-charge-${index}`}
                label="Amount"
                onChange={(amount) =>
                  update({
                    extraCharges: quote.extraCharges.map((current) =>
                      current.id === charge.id
                        ? { ...current, amount }
                        : current,
                    ),
                  })
                }
                value={charge.amount}
              />
              <button
                className="text-button"
                onClick={() =>
                  update({
                    extraCharges: quote.extraCharges.filter(
                      (current) => current.id !== charge.id,
                    ),
                    otherChargesReviewed: true,
                  })
                }
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
          <div className="quote-revision-inline-actions">
            <button
              className="button button--secondary"
              onClick={() =>
                update({
                  otherChargesReviewed: true,
                  extraCharges: [
                    ...quote.extraCharges,
                    {
                      id: `revision-charge-${quote.extraCharges.length + 1}`,
                      type: "other",
                      label: "",
                      amount: "",
                    },
                  ],
                })
              }
              type="button"
            >
              Add charge
            </button>
            <button
              className="text-button"
              onClick={() =>
                update({ otherChargesReviewed: true, extraCharges: [] })
              }
              type="button"
            >
              No additional charges
            </button>
          </div>
        </>
      );
    }

    if (section === "exclusions") {
      return (
        <>
          <fieldset className="contractor-fieldset">
            <legend>What is not included?</legend>
            <div className="contractor-option-grid">
              {Array.from(
                new Set([...quote.exclusions, ...exclusionOptions]),
              ).map((option) => {
                const checked = quote.exclusions.includes(option);
                return (
                  <label
                    className={`contractor-option ${
                      checked ? "contractor-option--selected" : ""
                    }`}
                    key={option}
                  >
                    <input
                      checked={checked}
                      onChange={() =>
                        update({
                          exclusions: toggleContractorExclusion(
                            quote.exclusions,
                            option,
                          ),
                        })
                      }
                      type="checkbox"
                    />
                    <span>{option}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {quote.exclusions.includes("Something else") && (
            <label className="contractor-inline-field">
              <span>What else is not included?</span>
              <input
                onChange={(event) =>
                  update({ otherExclusion: event.target.value })
                }
                value={quote.otherExclusion}
              />
            </label>
          )}
        </>
      );
    }

    if (section === "price") {
      return (
        <>
          <label className="contractor-inline-field">
            <span>Price status</span>
            <select
              onChange={(event) =>
                update({
                  priceStatus: event.target.value as
                    | "fixed"
                    | "may_change"
                    | "estimate",
                  priceChangeReasons:
                    event.target.value === "fixed"
                      ? []
                      : quote.priceChangeReasons,
                })
              }
              value={quote.priceStatus}
            >
              <option value="">Choose status</option>
              <option value="fixed">Fixed price</option>
              <option value="estimate">Estimate</option>
              <option value="may_change">Price may change</option>
            </select>
          </label>
          {quote.priceStatus && quote.priceStatus !== "fixed" && (
            <>
              <CheckboxGrid
                legend="What could change the price?"
                onChange={(priceChangeReasons) =>
                  update({ priceChangeReasons })
                }
                options={Array.from(
                  new Set([
                    ...quote.priceChangeReasons,
                    ...priceReasonOptions,
                  ]),
                )}
                values={quote.priceChangeReasons}
              />
              {quote.priceChangeReasons.includes("Something else") && (
                <label className="contractor-inline-field">
                  <span>What else could change the price?</span>
                  <input
                    onChange={(event) =>
                      update({ otherPriceChangeReason: event.target.value })
                    }
                    value={quote.otherPriceChangeReason}
                  />
                </label>
              )}
              <label className="contractor-inline-field">
                <span>Optional price note</span>
                <textarea
                  onChange={(event) =>
                    update({ priceChangeNote: event.target.value })
                  }
                  rows={3}
                  value={quote.priceChangeNote}
                />
              </label>
            </>
          )}
        </>
      );
    }

    if (section === "availability") {
      return (
        <>
          <label className="contractor-inline-field">
            <span>Earliest availability</span>
            <input
              list="revision-availability-options"
              onChange={(event) =>
                update({ startAvailability: event.target.value })
              }
              value={quote.startAvailability}
            />
            <datalist id="revision-availability-options">
              <option value="Within 24 hours" />
              <option value="Within 2–3 days" />
              <option value="Within one week" />
              <option value="Within two weeks" />
              <option value="Later" />
              <option value="Contact me to arrange" />
            </datalist>
          </label>
          {quote.startAvailability === "Later" && (
            <label className="contractor-inline-field">
              <span>Earliest start date</span>
              <input
                onChange={(event) =>
                  update({ laterStartDate: event.target.value })
                }
                type="date"
                value={quote.laterStartDate}
              />
            </label>
          )}
        </>
      );
    }

    if (section === "duration") {
      return (
        <label className="contractor-inline-field">
          <span>Expected duration</span>
          <input
            autoFocus
            list="revision-duration-options"
            onChange={(event) => update({ duration: event.target.value })}
            value={quote.duration}
          />
          <datalist id="revision-duration-options">
            <option value="Under 2 hours" />
            <option value="Half a day" />
            <option value="One day" />
            <option value="2–3 days" />
            <option value="More than 3 days" />
            <option value="Not sure yet" />
          </datalist>
        </label>
      );
    }

    if (section === "guarantee") {
      return (
        <>
          <label className="contractor-inline-field">
            <span>Is a warranty included?</span>
            <select
              onChange={(event) =>
                update({
                  guaranteePosition: event.target.value as
                    | "yes"
                    | "no"
                    | "not_applicable",
                })
              }
              value={quote.guaranteePosition}
            >
              <option value="">Choose an answer</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="not_applicable">Not applicable</option>
            </select>
          </label>
          {quote.guaranteePosition === "yes" && (
            <>
              <label className="contractor-inline-field">
                <span>Warranty duration</span>
                <input
                  list="revision-warranty-options"
                  onChange={(event) =>
                    update({ guaranteeDuration: event.target.value })
                  }
                  value={quote.guaranteeDuration}
                />
                <datalist id="revision-warranty-options">
                  <option value="3 months" />
                  <option value="6 months" />
                  <option value="12 months" />
                  <option value="2 years" />
                </datalist>
              </label>
              <label className="contractor-inline-field">
                <span>What is covered? — optional</span>
                <textarea
                  onChange={(event) =>
                    update({ guaranteeNote: event.target.value })
                  }
                  rows={3}
                  value={quote.guaranteeNote}
                />
              </label>
            </>
          )}
        </>
      );
    }

    if (section === "vat") {
      return (
        <>
          <label className="contractor-inline-field">
            <span>VAT registration</span>
            <select
              onChange={(event) =>
                update({
                  vatRegistered: event.target.value as "yes" | "no",
                  vatIncluded:
                    event.target.value === "no" ? "" : quote.vatIncluded,
                })
              }
              value={quote.vatRegistered}
            >
              <option value="">Choose an answer</option>
              <option value="no">Not VAT registered</option>
              <option value="yes">VAT registered</option>
            </select>
          </label>
          {quote.vatRegistered === "yes" && (
            <div className="contractor-action-grid">
              <label>
                <span>VAT treatment</span>
                <select
                  onChange={(event) =>
                    update({
                      vatIncluded: event.target.value as "yes" | "no",
                    })
                  }
                  value={quote.vatIncluded}
                >
                  <option value="">Choose treatment</option>
                  <option value="yes">Included in costs above</option>
                  <option value="no">Added to costs above</option>
                </select>
              </label>
              <label>
                <span>VAT rate</span>
                <select
                  onChange={(event) =>
                    update({
                      vatRate: event.target.value as
                        | "20"
                        | "5"
                        | "0"
                        | "other",
                    })
                  }
                  value={quote.vatRate}
                >
                  <option value="">Choose rate</option>
                  <option value="20">20%</option>
                  <option value="5">5%</option>
                  <option value="0">0%</option>
                  <option value="other">Other</option>
                </select>
              </label>
              {quote.vatRate === "other" && (
                <label>
                  <span>Custom VAT percentage</span>
                  <input
                    inputMode="decimal"
                    min="0"
                    onChange={(event) =>
                      update({ customVatRate: event.target.value })
                    }
                    type="number"
                    value={quote.customVatRate}
                  />
                </label>
              )}
            </div>
          )}
        </>
      );
    }

    if (section === "validity") {
      return (
        <label className="contractor-inline-field">
          <span>How long is this quote valid?</span>
          <input
            onChange={(event) =>
              update({ quoteValidity: event.target.value })
            }
            placeholder="e.g. 30 days from submission"
            value={quote.quoteValidity ?? ""}
          />
        </label>
      );
    }

    return (
      <>
        {quote.supportingAttachments?.length ? (
          <ul className="quote-revision-documents">
            {quote.supportingAttachments.map((document) => (
              <li key={document.id}>
                <span>{document.name}</span>
                <button
                  className="text-button"
                  onClick={() =>
                    update({
                      supportingAttachments:
                        quote.supportingAttachments?.filter(
                          (item) => item.id !== document.id,
                        ),
                    })
                  }
                  type="button"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No supporting document is attached.</p>
        )}
        <label className="contractor-inline-field">
          <span>Add or replace supporting document</span>
          <input
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              update({
                supportingAttachments: [
                  {
                    id: `revision-document-${file.name}`,
                    name: file.name,
                    mimeType: file.type || "application/octet-stream",
                    uploadedAt: new Date().toISOString(),
                    source: "contractor_portal",
                  },
                ],
              });
            }}
            type="file"
          />
        </label>
      </>
    );
  };

  return (
    <div className="quote-revision-editor">
      <aside className="quote-revision-questions">
        <div>
          <p className="eyebrow">Questions from the landlord</p>
          <span className={`revision-save-state revision-save-state--${saveState}`}>
            {saveState === "saving"
              ? "Saving Version 2 draft…"
              : saveState === "error"
                ? "Draft not saved — changes retained"
                : "Version 2 draft saved"}
          </span>
        </div>
        <ol>
          {landlordQuestions.map((question, index) => {
            const matchedSections = sectionsForClarificationQuestions([], [question]);
            const shortcut = /warranty|guarantee/i.test(question)
              ? "guarantee"
              : matchedSections[0];
            return (
              <li key={`${index}-${question}`}>
                <span>{question}</span>
                {shortcut && (
                  <button
                    className="text-button"
                    onClick={() => openAndScroll(shortcut)}
                    type="button"
                  >
                    Go to {sectionLabels[shortcut].toLowerCase()}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </aside>

      <section className="quote-revision-live-total" aria-live="polite">
        <div>
          <span>Calculated subtotal</span>
          <strong>{money(totals.subtotal)}</strong>
        </div>
        <div>
          <span>VAT</span>
          <strong>
            {totals.vatMode === "not_charged"
              ? "Not charged"
              : money(totals.vatAmount)}
          </strong>
        </div>
        <div>
          <span>Calculated final total</span>
          <strong>{money(totals.total)}</strong>
        </div>
        <p>Totals update from costs and VAT. The final total is not directly editable.</p>
      </section>

      <div className="quote-revision-sections">
        {orderedSections.map((section) => (
          <RevisionSection
            highlighted={highlightedSections.includes(section)}
            key={section}
            onToggle={() =>
              setOpenSection((current) => (current === section ? null : section))
            }
            open={openSection === section}
            section={section}
            summary={sectionSummary(section, quote)}
          >
            {renderFields(section)}
          </RevisionSection>
        ))}
      </div>
    </div>
  );
}

export function QuoteRevisionReview({
  quote,
  changes,
  expanded,
  onExpandedChange,
}: {
  quote: RepairQuoteResponseDraft;
  changes: QuoteFieldChange[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const totals = calculateContractorQuote(quote);
  return (
    <>
      <div className="quote-revision-changes">
        {changes.map((change) => (
          <article key={`${change.field}-${change.label}`}>
            <h3>{change.label}</h3>
            <p>
              <span>{change.before}</span>
              <b aria-hidden="true">→</b>
              <strong>{change.after}</strong>
            </p>
          </article>
        ))}
      </div>
      <button
        aria-expanded={expanded}
        className="button button--secondary"
        onClick={() => onExpandedChange(!expanded)}
        type="button"
      >
        {expanded ? "Hide complete updated quote" : "View complete updated quote"}
      </button>
      {expanded && (
        <div className="quote-revision-complete">
          <section>
            <h3>Work included</h3>
            <ol>
              {quote.workItems.map((item) => (
                <li key={item.id}>{item.label}</li>
              ))}
            </ol>
          </section>
          <section>
            <h3>Costs</h3>
            <dl>
              <div><dt>Labour</dt><dd>{money(totals.labour)}</dd></div>
              <div><dt>Materials</dt><dd>{money(totals.materials)}</dd></div>
              <div><dt>Additional charges</dt><dd>{money(totals.extras)}</dd></div>
              <div><dt>Subtotal</dt><dd>{money(totals.subtotal)}</dd></div>
              <div><dt>VAT</dt><dd>{money(totals.vatAmount)}</dd></div>
              <div><dt>Final total</dt><dd>{money(totals.total)}</dd></div>
            </dl>
          </section>
          <section>
            <h3>Conditions and timing</h3>
            <dl>
              <div><dt>Price status</dt><dd>{sectionSummary("price", quote)}</dd></div>
              <div><dt>Availability</dt><dd>{sectionSummary("availability", quote)}</dd></div>
              <div><dt>Duration</dt><dd>{quote.duration}</dd></div>
              <div><dt>Warranty</dt><dd>{sectionSummary("guarantee", quote)}</dd></div>
              <div><dt>Quote validity</dt><dd>{quote.quoteValidity}</dd></div>
            </dl>
          </section>
          <section>
            <h3>Materials and exclusions</h3>
            <p>{sectionSummary("materials", quote)}</p>
            <p>{sectionSummary("exclusions", quote)}</p>
          </section>
          <section>
            <h3>Supporting document</h3>
            <p>{sectionSummary("documents", quote)}</p>
          </section>
        </div>
      )}
    </>
  );
}
