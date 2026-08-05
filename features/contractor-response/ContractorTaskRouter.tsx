"use client";

import { useEffect, useState } from "react";
import type { ResolvedContractorTask } from "@/domain/procurement";
import { repairScopeServices } from "@/services";
import {
  StandardContractorApp,
  StatusPanel,
} from "@/components/ContractorApp";
import {
  ContractorClarificationExperience,
  ContractorReconfirmationExperience,
} from "@/components/ContractorProcurementStates";
import { ContractorInspectionConfirmation } from "@/features/inspections/ContractorInspectionConfirmation";

export function ContractorTaskRouter({ token }: { token: string }) {
  const [task, setTask] = useState<ResolvedContractorTask>();
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    let active = true;
    repairScopeServices.contractorTasks
      .resolveToken(token)
      .then((resolved) => {
        if (active) setTask(resolved);
      })
      .catch(() => {
        if (active) setInvalid(true);
      });
    return () => {
      active = false;
    };
  }, [token]);

  if (invalid) return <StatusPanel status="invalid" />;
  if (!task) {
    return (
      <main className="contractor-loading" aria-live="polite">
        <span className="contractor-loading__mark" aria-hidden="true">
          RS
        </span>
        <p>Opening your private task…</p>
      </main>
    );
  }
  if (task.tokenStatus !== "valid") {
    return <StatusPanel status={task.tokenStatus} />;
  }

  switch (task.taskType) {
    case "clarification":
      return <ContractorClarificationExperience task={task} token={token} />;
    case "selection_reconfirmation":
      return <ContractorReconfirmationExperience task={task} token={token} />;
    case "inspection_confirmation":
      return <ContractorInspectionConfirmation token={token} />;
    case "new_opportunity":
      return <StandardContractorApp resolvedTask={task} token={token} />;
  }
}

