import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from "promptfoo";

import type {
  HubSpotWorkflowRunConversationMessage,
  HubSpotWorkflowRunInboundMessageEnrichmentInputContext,
} from "@/services/hubspot-workflows/internal/mutations";
import type { ClaudeModel } from "@/services/claude";
import {
  requestInboundMessageWritebackPlan,
  type HubSpotWritebackPlanRequestResult,
} from "@/services/hubspot-workflows/internal/request-writeback-plan";

import type {
  EvalCase,
  EvalInboundMessageInput,
  InboundMessageTriggerInput,
} from "./cases";
import { formatPlanForJudge } from "./format-plan";

const DEFAULT_INBOUND_THREAD_ID = "eval-thread";
const DEFAULT_INBOUND_MESSAGE_LIMIT = 30;
const EVAL_CLAUDE_MODELS = {
  OPUS: "claude-opus-4-7",
  SONNET: "claude-sonnet-4-6",
  HAIKU: "claude-haiku-4-5-20251001",
} as const satisfies Record<string, ClaudeModel>;

export type EvaluateCaseResult = {
  output: string;
  vars: { triggerSummary: string };
};

export type EvaluateCaseOptions = {
  claudeModel?: ClaudeModel;
};

export async function evaluateCase(
  evalCase: EvalCase,
  options: EvaluateCaseOptions = {},
): Promise<EvaluateCaseResult> {
  switch (evalCase.trigger.kind) {
    case "inbound.message": {
      const context = buildInboundMessageContext(evalCase.trigger.context);
      const triggerSummary = buildInboundMessageTriggerSummary(context);
      const result: HubSpotWritebackPlanRequestResult =
        await requestInboundMessageWritebackPlan({
          enrichmentInputContext: context,
          claudeModel: options.claudeModel,
        });
      return {
        output: formatPlanForJudge(result),
        vars: { triggerSummary },
      };
    }
    case "contact.created": {
      throw new Error(
        'Eval trigger kind "contact.created" is not wired in this slice; it lands in a follow-up (see issue #57).',
      );
    }
  }
}

export function buildInboundMessageContext(
  input: InboundMessageTriggerInput,
): HubSpotWorkflowRunInboundMessageEnrichmentInputContext {
  return {
    source: input.source,
    hubSpotPortalId: input.hubSpotPortalId,
    occurredAt: input.occurredAt,
    triggeringMessageId: input.triggeringMessageId,
    contact: input.contact,
    currentConversationSession: {
      messageLimit:
        input.currentConversationSession.messageLimit ??
        DEFAULT_INBOUND_MESSAGE_LIMIT,
      messages: input.currentConversationSession.messages.map(
        expandConversationMessage,
      ),
    },
  };
}

export function expandConversationMessage(
  input: EvalInboundMessageInput,
): HubSpotWorkflowRunConversationMessage {
  return {
    id: input.id,
    threadId: input.threadId ?? DEFAULT_INBOUND_THREAD_ID,
    actorId: input.actorId ?? null,
    direction: input.direction ?? null,
    text: input.text,
    richText: input.richText ?? escapeHtml(input.text),
    createdAt: input.createdAt ?? null,
    truncationStatus: input.truncationStatus ?? "NOT_TRUNCATED",
  };
}

export function buildInboundMessageTriggerSummary(
  context: HubSpotWorkflowRunInboundMessageEnrichmentInputContext,
): string {
  const lines: string[] = [];
  const props = context.contact.properties;
  const name =
    [props.firstname, props.lastname].filter(Boolean).join(" ") ||
    `(unnamed contact ${context.contact.id})`;
  const email = props.email ?? "(no email)";
  lines.push(`Contact: ${name} <${email}> (HubSpot id ${context.contact.id})`);

  const populated = Object.entries(props).filter(
    ([, value]) => typeof value === "string" && value.length > 0,
  );
  if (populated.length > 0) {
    lines.push("Known contact fields:");
    for (const [key, value] of populated) {
      lines.push(`- ${key}: ${value as string}`);
    }
  } else {
    lines.push("Known contact fields: (none populated)");
  }

  lines.push("");
  const sessionMessages = context.currentConversationSession.messages;
  lines.push(
    `Conversation session: ${sessionMessages.length} message(s), session limit ${context.currentConversationSession.messageLimit}.`,
  );

  const triggering = sessionMessages.find(
    (message) => message.id === context.triggeringMessageId,
  );
  if (triggering) {
    lines.push(
      `Triggering message [${triggering.id}], direction=${triggering.direction ?? "(unknown)"}, createdAt=${triggering.createdAt ?? "(unknown)"}:`,
    );
    for (const line of (triggering.text ?? "(no text)").split("\n")) {
      lines.push(`> ${line}`);
    }
  } else {
    lines.push(
      `Triggering message id ${context.triggeringMessageId} not found in the session — judge should treat this as a context-shape problem.`,
    );
  }

  const others = sessionMessages.filter(
    (message) => message.id !== context.triggeringMessageId,
  );
  if (others.length > 0) {
    lines.push("");
    lines.push("Other recent messages in the contact's threads:");
    for (const message of others) {
      const direction = message.direction ?? "?";
      const createdAt = message.createdAt ?? "(unknown time)";
      const text = (message.text ?? "(no text)").replace(/\n+/g, " ");
      lines.push(`- [${direction} @ ${createdAt}] ${text}`);
    }
  }

  return lines.join("\n");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default class PropertyLeadEvalProvider implements ApiProvider {
  private readonly providerId: string;
  private readonly claudeModel: ClaudeModel | undefined;

  constructor(options?: ProviderOptions) {
    this.providerId =
      typeof options?.label === "string"
        ? options.label
        : (options?.id ?? "propertylead-eval-provider");
    this.claudeModel = readClaudeModelConfig(options?.config);
  }

  id(): string {
    return this.providerId;
  }

  async callApi(
    _prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const rawCase = context?.vars?.case;
    if (!rawCase || typeof rawCase !== "object") {
      return {
        error:
          "PropertyLead eval provider expected a `case` test var (an EvalCase object).",
      };
    }
    try {
      const { output, vars } = await evaluateCase(rawCase as EvalCase, {
        claudeModel: this.claudeModel,
      });
      return {
        output,
        metadata: { triggerSummary: vars.triggerSummary },
      };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "PropertyLead eval provider failed to evaluate the case.",
      };
    }
  }
}

function readClaudeModelConfig(config: unknown): ClaudeModel | undefined {
  if (!config || typeof config !== "object") return undefined;
  const configured = (
    config as { claudeModel?: unknown; model?: unknown }
  ).claudeModel ?? (config as { model?: unknown }).model;
  if (typeof configured !== "string") return undefined;
  return resolveClaudeModel(configured);
}

function resolveClaudeModel(configured: string): ClaudeModel {
  const normalized = configured.trim().toLowerCase();
  const byName: Record<string, ClaudeModel> = {
    sonnet: EVAL_CLAUDE_MODELS.SONNET,
    opus: EVAL_CLAUDE_MODELS.OPUS,
    haiku: EVAL_CLAUDE_MODELS.HAIKU,
    [EVAL_CLAUDE_MODELS.SONNET]: EVAL_CLAUDE_MODELS.SONNET,
    [EVAL_CLAUDE_MODELS.OPUS]: EVAL_CLAUDE_MODELS.OPUS,
    [EVAL_CLAUDE_MODELS.HAIKU]: EVAL_CLAUDE_MODELS.HAIKU,
  };
  const model = byName[normalized];
  if (!model) {
    throw new Error(
      `Unsupported Claude eval model "${configured}". Use one of: sonnet, opus, haiku.`,
    );
  }
  return model;
}
