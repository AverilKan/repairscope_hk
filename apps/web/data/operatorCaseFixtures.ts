// TEST-ONLY sample cases for the operator case workspace (components/
// operator/OperatorCaseWorkspace.tsx). These are NOT wired into any live
// route — the real /operator list and detail pages always come from
// services/operator/OperatorSubmissionService.ts (mock or real API,
// depending on NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE). This file exists so
// unit/e2e tests have a realistic, non-trivial ProblemBrief to render
// without needing a live backend — each brief is produced with the SAME
// buildRepairBrief() the real owner journey uses, built from a
// hand-written RepairIntakeDraft rather than hand-faked JSON.
//
// Deliberately does NOT reuse services/operator/MockOperatorSubmissionService.ts's
// "RS-MOCK01" fixture: that one is a pre-HK-rework fixture pinned by
// tests/e2e/operator-brief-readability.spec.ts and must not be touched.
// "RS-PROTO0N" references are used here specifically so a fixture used in
// a test failure/snapshot is never mistaken for a real RS-XXXXXX case.

import { buildRepairBrief } from "@/domain/brief";
import type { ProblemBrief, RepairIntakeDraft } from "@/domain/types";

export interface OperatorCaseFixture {
  caseReference: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  submittedAt: string;
  brief: ProblemBrief;
}

// Case 1 — leak, WITH evidence, a prior quotation already received, a
// fairly complete/confident set of answers.
const leakDraft: RepairIntakeDraft = {
  id: "fixture-case-leak-01",
  category: "leak",
  originalReport: "",
  extractedSymptoms: [],
  responses: {
    affected: "ceiling",
    branchFirst: "rain",
    branchSecond: ["mark", "mould"],
    branchThird: "several",
    safety: "none",
    duration: "month",
    frequency: "occasional",
    worsening: "yes",
    prior: "quote",
    priorDetail: "師傅上門睇過，話可能係天台防水失效，報價未落實。",
    hasEvidence: "yes",
    evidenceKind: "repair-media",
    management: "yes",
    sharedArea: "yes",
    accessBy: "owner",
    availability: "平日 7 點後；星期六全日",
    district: "eastern",
    building: "太古城",
    block: "美柏閣",
    floor: "18",
    unit: "A",
    relationship: "owner-occupier",
    additionalContext: "樓上單位話佢哋冇滲水情況，但天花濕痕範圍持續擴大。",
  },
  safetyAcknowledgements: [],
  status: "submitted",
  updatedAt: "2026-08-10T09:32:00.000Z",
};

// Case 2 — electrical, NO evidence, nothing attempted yet, tighter/more
// uncertain answers — exercises the sparser end of a real submission.
const electricalDraft: RepairIntakeDraft = {
  id: "fixture-case-electrical-01",
  category: "electrical",
  originalReport: "",
  extractedSymptoms: [],
  responses: {
    affected: "one-room",
    branchFirst: ["tripping", "outlet"],
    branchSecond: "recurring",
    branchThird: "stopped",
    safety: "none",
    duration: "week",
    frequency: "daily",
    worsening: "unsure",
    prior: "no",
    hasEvidence: "no",
    management: "no",
    sharedArea: "unsure",
    accessBy: "tenant",
    availability: "要提早一日通知租客",
    district: "kwun-tong",
    building: "",
    block: "",
    floor: "",
    unit: "",
    relationship: "landlord",
    additionalContext: "",
  },
  safetyAcknowledgements: [],
  status: "submitted",
  updatedAt: "2026-08-13T14:05:00.000Z",
};

// Case 3 — drainage, mostly "not sure" answers and no building-management
// contact yet — the messy/uncertain end of a real case.
const drainageDraft: RepairIntakeDraft = {
  id: "fixture-case-drainage-01",
  category: "drainage",
  originalReport: "",
  extractedSymptoms: [],
  responses: {
    affected: "floor-drain",
    branchFirst: ["slow", "smell"],
    branchSecond: "first",
    branchThird: "one",
    safety: "none",
    duration: "unsure",
    frequency: "constant",
    worsening: "yes",
    prior: "no",
    hasEvidence: "no",
    management: "no",
    sharedArea: "unsure",
    accessBy: "management",
    availability: "唔肯定，要問管理處",
    district: "sha-tin",
    building: "沙田第一城",
    block: "",
    floor: "",
    unit: "",
    relationship: "manager",
    additionalContext: "業主人喺外國，暫時由我代為處理同跟進。",
  },
  safetyAcknowledgements: [],
  status: "submitted",
  updatedAt: "2026-08-15T11:47:00.000Z",
};

export const operatorCaseFixtures: OperatorCaseFixture[] = [
  {
    caseReference: "RS-PROTO01",
    ownerName: "陳大文",
    ownerEmail: "tai.man.chan@example.com",
    ownerPhone: "+852 9123 4567",
    submittedAt: leakDraft.updatedAt,
    brief: buildRepairBrief(leakDraft),
  },
  {
    caseReference: "RS-PROTO02",
    ownerName: "李小姐",
    ownerEmail: "miss.lee@example.com",
    ownerPhone: "9234 5678",
    submittedAt: electricalDraft.updatedAt,
    brief: buildRepairBrief(electricalDraft),
  },
  {
    caseReference: "RS-PROTO03",
    ownerName: "黃生（代業主）",
    ownerEmail: "wong.manager@example.com",
    ownerPhone: "9345 6789",
    submittedAt: drainageDraft.updatedAt,
    brief: buildRepairBrief(drainageDraft),
  },
];

export function findOperatorCaseFixture(caseReference: string): OperatorCaseFixture | undefined {
  return operatorCaseFixtures.find((entry) => entry.caseReference === caseReference);
}
