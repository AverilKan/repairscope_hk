import type {
  OperatorSubmissionDetail,
  OperatorSubmissionStatusUpdate,
  OperatorSubmissionSummary,
} from "@/domain/operatorSubmission";
import type { OperatorSubmissionService } from "./OperatorSubmissionService";

const FIXTURE_SUBMISSIONS: OperatorSubmissionDetail[] = [
  {
    id: "mock-submission-1",
    publicReference: "RS-MOCK01",
    status: "new",
    issueCategory: "plumbing-leak",
    landlordName: "Jamie Landlord",
    propertyPostcode: "WD17",
    safetyFlags: ["water_uncontrolled"],
    createdAt: new Date().toISOString(),
    questionnaireVersion: "v1",
    questionnaireAnswers: { waterFlow: "uncontrolled" },
    generatedBrief: { reportedFacts: ["Kitchen tap leaking heavily, floor is wet."] },
    landlordEmail: "jamie@example.com",
    landlordPhone: "07700900000",
    propertyAddress: null,
    preferredContactMethod: "email",
    accessNotes: null,
    evidenceNotes: "Two photos on my phone.",
    consentToContact: true,
    consentToShareWithContractors: true,
    internalReviewNotes: null,
    closedReason: null,
    updatedAt: new Date().toISOString(),
  },
];

/** In-memory only, mirroring the rest of services/mock.ts — for local
 * dev/demos, never used against a real Clerk session. */
export class MockOperatorSubmissionService implements OperatorSubmissionService {
  private submissions = [...FIXTURE_SUBMISSIONS];

  async list(): Promise<OperatorSubmissionSummary[]> {
    return this.submissions.map(({ id, publicReference, status, issueCategory, landlordName, propertyPostcode, safetyFlags, createdAt }) => ({
      id,
      publicReference,
      status,
      issueCategory,
      landlordName,
      propertyPostcode,
      safetyFlags,
      createdAt,
    }));
  }

  async get(id: string): Promise<OperatorSubmissionDetail> {
    const found = this.submissions.find((s) => s.id === id);
    if (!found) throw new Error("Mock submission not found.");
    return found;
  }

  async updateStatus(
    id: string,
    update: OperatorSubmissionStatusUpdate,
  ): Promise<OperatorSubmissionDetail> {
    const index = this.submissions.findIndex((s) => s.id === id);
    if (index === -1) throw new Error("Mock submission not found.");
    const updated: OperatorSubmissionDetail = {
      ...this.submissions[index],
      status: update.status,
      internalReviewNotes: update.internalReviewNotes ?? this.submissions[index].internalReviewNotes,
      closedReason: update.closedReason ?? null,
      updatedAt: new Date().toISOString(),
    };
    this.submissions[index] = updated;
    return updated;
  }
}
