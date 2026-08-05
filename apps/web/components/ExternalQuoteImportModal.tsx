"use client";

import { useState } from "react";
import type {
  ExtractedExternalProposalDraft,
  ExtractedField,
  ExtractedFieldState,
} from "@/domain/procurement";
import type { SubmittedContractorResponse } from "@/domain/types";
import { repairScopeServices } from "@/services";
import { DecisionModal } from "./DecisionModal";

const fieldStateLabels: Record<ExtractedFieldState, string> = {
  extracted: "Extracted from document",
  corrected_by_landlord: "Corrected by landlord",
  not_stated: "Not stated",
};

function FieldState({ state }: { state: ExtractedFieldState }) {
  return (
    <span className={`extraction-state extraction-state--${state}`}>
      {fieldStateLabels[state]}
    </span>
  );
}

function textList(value: string[]) {
  return value.join("\n");
}

function parseTextList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ExternalQuoteImportModal({
  repairId,
  onClose,
  onAdded,
}: {
  repairId: string;
  onClose: () => void;
  onAdded: (
    response: SubmittedContractorResponse,
    businessName: string,
  ) => void;
}) {
  const [stage, setStage] = useState<
    "upload" | "extracting" | "review" | "saving" | "saved"
  >("upload");
  const [draft, setDraft] = useState<ExtractedExternalProposalDraft>();
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState("");

  const extract = async (sourceId: string) => {
    setStage("extracting");
    setError("");
    try {
      const result =
        await repairScopeServices.externalQuotes.extractQuote(sourceId);
      setDraft(result);
      setStage("review");
    } catch (caught) {
      setStage("upload");
      setError(
        caught instanceof Error
          ? caught.message
          : "The mock extraction could not be completed.",
      );
    }
  };

  const upload = async (file?: File) => {
    if (!file) return;
    setError("");
    try {
      const source = await repairScopeServices.externalQuotes.createFileSource(file);
      await extract(source.sourceId);
    } catch (caught) {
      setStage("upload");
      setError(
        caught instanceof Error
          ? caught.message
          : "The quote could not be uploaded.",
      );
    }
  };

  const importEmailDocument = async () => {
    const source = await repairScopeServices.externalQuotes.createEmailSource({
      fileName: "forwarded-roof-quote.pdf",
      messageId: "demo",
    });
    await extract(source.sourceId);
  };

  const updateField = <
    K extends Exclude<keyof ExtractedExternalProposalDraft, "source" | "reviewed">,
  >(
    key: K,
    value: ExtractedExternalProposalDraft[K] extends ExtractedField<infer T>
      ? T
      : never,
  ) => {
    setDraft((current) => {
      if (!current) return current;
      const empty =
        value === "" ||
        value === null ||
        (Array.isArray(value) && value.length === 0);
      return {
        ...current,
        [key]: {
          value,
          state: empty ? "not_stated" : "corrected_by_landlord",
        },
      };
    });
  };

  const save = async () => {
    if (!draft || !reviewed) return;
    setStage("saving");
    setError("");
    try {
      const response =
        await repairScopeServices.externalQuotes.saveExternalProposal(repairId, {
          ...draft,
          reviewed: true,
        });
      onAdded(response, draft.contractorBusiness.value || "Imported contractor");
      setStage("saved");
    } catch (caught) {
      setStage("review");
      setError(
        caught instanceof Error
          ? caught.message
          : "The quote could not be added. Your review has been retained.",
      );
    }
  };

  const title =
    stage === "upload"
      ? "Import a quote"
      : stage === "extracting"
        ? "Reading the quote"
        : stage === "saved"
          ? "Quote added to comparison"
          : "Review extracted quote";

  return (
    <DecisionModal
      className="decision-modal--import"
      eyebrow="External quote · Frontend-only import"
      footer={
        stage === "review" || stage === "saving" ? (
          <>
            <button
              className="button button--secondary"
              disabled={stage === "saving"}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="button"
              disabled={!reviewed || stage === "saving"}
              onClick={() => void save()}
              type="button"
            >
              {stage === "saving" ? "Adding quote…" : "Add quote to comparison"}
            </button>
          </>
        ) : stage === "saved" ? (
          <button className="button" onClick={onClose} type="button">
            Return to comparison
          </button>
        ) : (
          <button
            className="button button--secondary"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
        )
      }
      onClose={onClose}
      title={title}
    >
      {stage === "upload" && (
        <div className="external-upload">
          <p>
            Upload the source document. RepairScope will show deterministic
            extracted fields for your review; nothing is saved automatically.
          </p>
          <label className="external-upload__dropzone" htmlFor="external-quote-file">
            <span aria-hidden="true">+</span>
            <strong>Choose a quote document</strong>
            <small>PDF, JPEG, PNG or HEIC</small>
          </label>
          <input
            accept=".pdf,.jpg,.jpeg,.png,.heic,application/pdf,image/jpeg,image/png,image/heic,image/heif"
            id="external-quote-file"
            onChange={(event) => void upload(event.target.files?.[0])}
            type="file"
          />
          <div className="external-upload__email">
            <span>or</span>
            <button
              className="button button--secondary"
              onClick={() => void importEmailDocument()}
              type="button"
            >
              Use mocked emailed document
            </button>
          </div>
          {error && <p className="field-error" role="alert">{error}</p>}
        </div>
      )}

      {stage === "extracting" && (
        <div className="external-extracting" role="status">
          <span aria-hidden="true">RS</span>
          <h3>Extracting stated quote details…</h3>
          <p>Missing information will remain marked as Not stated.</p>
        </div>
      )}

      {(stage === "review" || stage === "saving") && draft && (
        <div className="external-review">
          <div className="external-review__source">
            <div>
              <span>Source document</span>
              <strong>{draft.source.fileName}</strong>
            </div>
            <span>
              {draft.source.importedFrom === "email_document"
                ? "Mocked email import"
                : "Uploaded file"}
            </span>
          </div>

          <section>
            <h3>Contractor</h3>
            <div className="external-review-grid">
              <label>
                <span>Contact name</span>
                <FieldState state={draft.contractorName.state} />
                <input
                  onChange={(event) =>
                    updateField("contractorName", event.target.value)
                  }
                  placeholder="Not stated"
                  value={draft.contractorName.value}
                />
              </label>
              <label>
                <span>Business name</span>
                <FieldState state={draft.contractorBusiness.state} />
                <input
                  onChange={(event) =>
                    updateField("contractorBusiness", event.target.value)
                  }
                  placeholder="Not stated"
                  value={draft.contractorBusiness.value}
                />
              </label>
              <label>
                <span>Email</span>
                <FieldState state={draft.contractorEmail.state} />
                <input
                  onChange={(event) =>
                    updateField("contractorEmail", event.target.value)
                  }
                  placeholder="Not stated"
                  type="email"
                  value={draft.contractorEmail.value}
                />
              </label>
              <label>
                <span>Phone</span>
                <FieldState state={draft.contractorPhone.state} />
                <input
                  onChange={(event) =>
                    updateField("contractorPhone", event.target.value)
                  }
                  placeholder="Not stated"
                  type="tel"
                  value={draft.contractorPhone.value}
                />
              </label>
            </div>
          </section>

          <section>
            <h3>Work and materials</h3>
            <label>
              <span>Work items · one per line</span>
              <FieldState state={draft.workItems.state} />
              <textarea
                onChange={(event) =>
                  updateField("workItems", parseTextList(event.target.value))
                }
                rows={5}
                value={textList(draft.workItems.value)}
              />
            </label>
            <label>
              <span>Materials · one per line</span>
              <FieldState state={draft.materials.state} />
              <textarea
                onChange={(event) =>
                  updateField("materials", parseTextList(event.target.value))
                }
                placeholder="Not stated"
                rows={4}
                value={textList(draft.materials.value)}
              />
            </label>
            <label>
              <span>Materials certainty</span>
              <FieldState state={draft.materialsStatus.state} />
              <select
                onChange={(event) =>
                  updateField(
                    "materialsStatus",
                    event.target.value as
                      | "confirmed"
                      | "estimated"
                      | "to_confirm"
                      | "",
                  )
                }
                value={draft.materialsStatus.value}
              >
                <option value="">Not stated</option>
                <option value="confirmed">Confirmed</option>
                <option value="estimated">Estimated</option>
                <option value="to_confirm">To be confirmed</option>
              </select>
            </label>
          </section>

          <section>
            <h3>Costs</h3>
            <div className="external-review-grid external-review-grid--money">
              {(
                [
                  ["labourAmount", "Labour"],
                  ["materialsAmount", "Materials"],
                  ["subtotal", "Subtotal"],
                  ["vatAmount", "VAT"],
                  ["finalTotal", "Final total"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <FieldState state={draft[key].state} />
                  <span className="money-input">
                    <span>£</span>
                    <input
                      inputMode="decimal"
                      min="0"
                      onChange={(event) =>
                        updateField(
                          key,
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                        )
                      }
                      placeholder="Not stated"
                      type="number"
                      value={draft[key].value ?? ""}
                    />
                  </span>
                </label>
              ))}
            </div>
            <label>
              <span>VAT position</span>
              <FieldState state={draft.vat.state} />
              <select
                onChange={(event) => {
                  const mode = event.target.value as
                    | "not_charged"
                    | "included"
                    | "added"
                    | "not_stated";
                  updateField("vat", {
                    mode,
                    rateBasisPoints:
                      mode === "included" || mode === "added"
                        ? 2000
                        : undefined,
                    amount:
                      draft.vatAmount.value !== null
                        ? {
                            amountMinor: Math.round(
                              draft.vatAmount.value * 100,
                            ),
                            currency: "GBP",
                          }
                        : undefined,
                  });
                }}
                value={draft.vat.value.mode}
              >
                <option value="not_charged">VAT not charged</option>
                <option value="included">VAT included</option>
                <option value="added">VAT added</option>
                <option value="not_stated">VAT not stated</option>
              </select>
              {draft.vat.value.mode === "not_stated" && (
                <small>
                  Review the source document before adding this quote. No VAT
                  assumption will be made.
                </small>
              )}
            </label>
            <label>
              <span>Additional charges · label | amount</span>
              <FieldState state={draft.additionalCharges.state} />
              <textarea
                onChange={(event) =>
                  updateField(
                    "additionalCharges",
                    event.target.value
                      .split("\n")
                      .map((line) => {
                        const [label, amount] = line.split("|");
                        return {
                          label: label?.trim() ?? "",
                          amount: Number(amount?.trim() || 0),
                        };
                      })
                      .filter((charge) => charge.label),
                  )
                }
                rows={3}
                value={draft.additionalCharges.value
                  .map((charge) => `${charge.label} | ${charge.amount}`)
                  .join("\n")}
              />
            </label>
            <label>
              <span>Price status</span>
              <FieldState state={draft.priceStatus.state} />
              <select
                onChange={(event) =>
                  updateField(
                    "priceStatus",
                    event.target.value as
                      | "fixed"
                      | "estimate"
                      | "may_change"
                      | "",
                  )
                }
                value={draft.priceStatus.value}
              >
                <option value="">Not stated</option>
                <option value="fixed">Fixed price</option>
                <option value="estimate">Estimate</option>
                <option value="may_change">Price may change</option>
              </select>
            </label>
          </section>

          <section>
            <h3>Commercial details</h3>
            <label>
              <span>Exclusions · one per line</span>
              <FieldState state={draft.exclusions.state} />
              <textarea
                onChange={(event) =>
                  updateField("exclusions", parseTextList(event.target.value))
                }
                placeholder="Not stated"
                rows={3}
                value={textList(draft.exclusions.value)}
              />
            </label>
            <label>
              <span>Price-change conditions · one per line</span>
              <FieldState state={draft.priceChangeConditions.state} />
              <textarea
                onChange={(event) =>
                  updateField(
                    "priceChangeConditions",
                    parseTextList(event.target.value),
                  )
                }
                placeholder="Not stated"
                rows={3}
                value={textList(draft.priceChangeConditions.value)}
              />
            </label>
            <div className="external-review-grid">
              {(
                [
                  ["earliestStart", "Earliest start"],
                  ["duration", "Duration"],
                  ["guarantee", "Warranty"],
                  ["quoteValidity", "Quote validity"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <FieldState state={draft[key].state} />
                  <input
                    onChange={(event) => updateField(key, event.target.value)}
                    placeholder="Not stated"
                    value={draft[key].value}
                  />
                </label>
              ))}
            </div>
          </section>

          <label className="external-review-confirmation">
            <input
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
              type="checkbox"
            />
            <span>
              I have reviewed the extracted fields against the source document.
            </span>
          </label>
          {error && (
            <div className="submission-error" role="alert">
              <strong>Quote not added</strong>
              <p>{error}</p>
            </div>
          )}
        </div>
      )}

      {stage === "saved" && draft && (
        <div className="external-import-success" role="status">
          <span aria-hidden="true">✓</span>
          <h3>{draft.contractorBusiness.value} is now in the comparison</h3>
          <p>
            The canonical response is labelled External quote · landlord
            imported. The original source document remains attached.
          </p>
        </div>
      )}
    </DecisionModal>
  );
}
