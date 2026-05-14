import type {
  HubSpotWorkflowRunContactCreatedEnrichmentInputContext,
  HubSpotWorkflowRunConversationMessage,
  HubSpotWorkflowRunInboundMessageEnrichmentInputContext,
} from "@/services/hubspot-workflows/internal/mutations";

export type EvalInboundMessageInput = Omit<
  Partial<HubSpotWorkflowRunConversationMessage>,
  "id" | "text"
> & {
  id: string;
  text: string;
};

export type InboundMessageTriggerInput = Omit<
  HubSpotWorkflowRunInboundMessageEnrichmentInputContext,
  "currentConversationSession"
> & {
  currentConversationSession: {
    messageLimit?: number;
    messages: EvalInboundMessageInput[];
  };
};

export type ContactCreatedTriggerInput =
  HubSpotWorkflowRunContactCreatedEnrichmentInputContext;

export type EvalCase =
  | {
      name: string;
      rubric: string;
      trigger: { kind: "inbound.message"; context: InboundMessageTriggerInput };
    }
  | {
      name: string;
      rubric: string;
      trigger: {
        kind: "contact.created";
        context: ContactCreatedTriggerInput;
      };
    };

export const dataset: EvalCase[] = [
  {
    name: "inbound.message :: strong-signal buyer preapproved, wants Saturday tour",
    rubric: [
      "PASS only if ALL of:",
      "- Decision is `writeback` (not no_writeback).",
      "- `pd_transaction_side` is set to `buyer`.",
      "- `pd_financing_status` is set to `preapproved` (the lead explicitly says they're preapproved for $850k).",
      "- `pd_urgency` is `high` or `critical` (the lead asks for a tour this Saturday and must close before August 31).",
      "- `pd_budget_max` reflects 850000 (the lead's preapproval amount).",
      "- The plan ties the lead to the listing at 1247 Oak Ridge Drive (via `pd_interested_listing_address`, the note, or both).",
      "- The note is short (≤ ~5 short lines), plain text, and actually helps the agent decide what to do next (e.g. suggests confirming the Saturday tour, summarizes the close-by-Aug-31 constraint).",
      "FAIL if the plan returns no_writeback, drops the buyer/financing/urgency signals, fabricates fields not implied by the message, or returns a long essay note.",
    ].join("\n"),
    trigger: {
      kind: "inbound.message",
      context: {
        source: "hubspot_inbound_message",
        hubSpotPortalId: "8472901",
        occurredAt: "2026-05-12T14:23:11.482Z",
        triggeringMessageId: "msg-strong-buyer-001",
        contact: {
          id: "44219701123",
          properties: {
            email: "megan.sandoval@gmail.com",
            firstname: "Megan",
            lastname: "Sandoval",
            phone: null,
            mobilephone: "+1 (415) 555-7821",
            hs_analytics_source: "ORGANIC_SEARCH",
            hs_latest_source: "ORGANIC_SEARCH",
            address: null,
            city: null,
            state: null,
            zip: null,
            country: null,
            hs_timezone: null,
            pd_transaction_side: null,
            pd_primary_intent: null,
            pd_urgency: null,
            pd_financing_status: null,
            pd_budget_min: null,
            pd_budget_max: null,
            pd_interested_listing_address: null,
            pd_interested_listing_url: null,
            pd_buy_readiness: null,
            pd_timeframe_bucket: null,
            pd_has_existing_agent: null,
          },
        },
        currentConversationSession: {
          messageLimit: 30,
          messages: [
            {
              id: "msg-strong-buyer-001",
              direction: "INCOMING",
              createdAt: "2026-05-12T14:23:11.482Z",
              text: "Hi! I saw your listing at 1247 Oak Ridge Drive on Zillow this morning. My husband and I are preapproved for $850k and would love to tour it this Saturday around 10:30am if it's still available. We need to be in before our lease ends on August 31, so timing matters for us. Can we make that work?",
            },
          ],
        },
      },
    },
  },
];
