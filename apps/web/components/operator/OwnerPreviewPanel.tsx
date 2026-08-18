"use client";

// The operator-side wrapper for the owner proposal preview (Commit C) —
// reads the case's existing local contractor/comparison state (the SAME
// state Slice 2/3 already use, no duplicate store) and supplies clean
// props to the pure OwnerProposalPreview component. This is deliberately
// the only piece that knows about localStorage; OwnerProposalPreview
// itself stays reusable once proposal data is server-backed.

import { useEffect, useState } from "react";
import { OwnerProposalPreview } from "@/components/owner/OwnerProposalPreview";
import { toOwnerVisibleProposal } from "@/domain/contractorResponse";
import { emptyOperatorCaseState, proposalContractors, readOperatorCaseState } from "@/domain/operatorCaseState";

export function OwnerPreviewPanel({ caseReference }: { caseReference: string }) {
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState(() => emptyOperatorCaseState(caseReference));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setState(readOperatorCaseState(caseReference));
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [caseReference]);

  if (!loaded) {
    return <p role="status">載入中…</p>;
  }

  const proposals = proposalContractors(state.contractors).map(toOwnerVisibleProposal);

  return (
    <OwnerProposalPreview
      caseReference={caseReference}
      proposals={proposals}
      keyDifferences={state.comparisonKeyDifferences ?? ""}
      unresolvedQuestions={state.comparisonUnresolvedQuestions ?? ""}
      repairScopeNote={state.comparisonRepairScopeNote ?? ""}
    />
  );
}
