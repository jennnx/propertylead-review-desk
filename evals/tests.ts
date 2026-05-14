import { dataset, type EvalCase } from "./cases";
import {
  buildInboundMessageContext,
  buildInboundMessageTriggerSummary,
} from "./provider";

type PromptfooTestRow = {
  description: string;
  vars: {
    case: EvalCase;
    triggerSummary: string;
    criteria: string;
  };
  assert: Array<{ type: "llm-rubric"; value: string }>;
};

export default async function generateTests(): Promise<PromptfooTestRow[]> {
  return dataset.map((evalCase) => ({
    description: evalCase.name,
    vars: {
      case: evalCase,
      triggerSummary: triggerSummaryFor(evalCase),
      criteria: evalCase.rubric,
    },
    assert: [{ type: "llm-rubric", value: evalCase.rubric }],
  }));
}

function triggerSummaryFor(evalCase: EvalCase): string {
  switch (evalCase.trigger.kind) {
    case "inbound.message":
      return buildInboundMessageTriggerSummary(
        buildInboundMessageContext(evalCase.trigger.context),
      );
    case "contact.created":
      return "(contact.created trigger summary lands in a follow-up slice — issue #57)";
  }
}
