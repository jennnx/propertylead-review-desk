import {
  WRITABLE_HUBSPOT_PROPERTY_CATALOG,
  type WritableHubSpotPropertyCatalogEntry,
} from "@/services/hubspot";

import { isClaudeUpdateableHubSpotPropertyEntry } from "./claude-updateable-fields";
import type {
  HubSpotWorkflowRunContactCreatedEnrichmentInputContext,
  HubSpotWorkflowRunInboundMessageEnrichmentInputContext,
} from "./mutations";

export type HubSpotWritebackPlanToolSchema = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    [key: string]: unknown;
  };
};

export type HubSpotWritebackPlanPromptMaterial = {
  model: string;
  system: string;
  userMessage: string;
  tool: HubSpotWritebackPlanToolSchema;
};

export const HUBSPOT_WRITEBACK_PLAN_TOOL_NAME = "propose_writeback_plan";

export function buildContactCreatedWritebackPlanPrompt(input: {
  enrichmentInputContext: HubSpotWorkflowRunContactCreatedEnrichmentInputContext;
  model: string;
}): HubSpotWritebackPlanPromptMaterial {
  const userMessage = [
    "A new HubSpot contact was just created. Review it for useful field updates or a short note for the assigned real estate agent.",
    "",
    "Current HubSpot contact:",
    "```json",
    JSON.stringify(input.enrichmentInputContext.contact, null, 2),
    "```",
  ].join("\n");

  return {
    model: input.model,
    system: buildSystemPrompt(),
    userMessage,
    tool: buildWritebackPlanTool(),
  };
}

export function buildInboundMessageWritebackPlanPrompt(input: {
  enrichmentInputContext: HubSpotWorkflowRunInboundMessageEnrichmentInputContext;
  model: string;
}): HubSpotWritebackPlanPromptMaterial {
  const userMessage = [
    "An inbound HubSpot Conversations message was received. Review it for useful field updates or a short note for the assigned real estate agent.",
    "",
    "Triggering message id:",
    "```",
    input.enrichmentInputContext.triggeringMessageId,
    "```",
    "",
    "Current HubSpot contact:",
    "```json",
    JSON.stringify(input.enrichmentInputContext.contact, null, 2),
    "```",
    "",
    "Current Conversation Session:",
    "```json",
    JSON.stringify(
      input.enrichmentInputContext.currentConversationSession,
      null,
      2,
    ),
    "```",
  ].join("\n");

  return {
    model: input.model,
    system: buildSystemPrompt(),
    userMessage,
    tool: buildWritebackPlanTool(),
  };
}

function buildSystemPrompt(): string {
  return [
    "You help a real estate agent triage incoming leads and messages in HubSpot.",
    "You will receive scattered CRM data and sometimes recent message history. Use it to make the lead easier and faster for the assigned agent to act on.",
    "",
    "Your job is to check two equally important questions:",
    "1. Does the new information clearly improve any HubSpot field that Claude is allowed to update?",
    "2. Can you help the assigned agent review this lead faster with a brief note, such as condensed context, a suggested next action, or a drafted reply?",
    "",
    "You may return field updates only, a note only, both field updates and a note, or no_writeback. All four outcomes are valid.",
    "The goal is to be helpful, not noisy. Return no_writeback when there is no meaningful field update and no note that would genuinely speed up the agent's review.",
    "",
    "Field update rules:",
    "- Use only catalog fields marked UPDATEABLE.",
    "- Fields marked CONTEXT ONLY are present to help you reason; never return them in fieldUpdates.",
    "- Do not invent field names or values.",
    "- Do not repeat existing values unless the new information makes the field more accurate.",
    "- Prefer specific facts from the payload over guesses. Use unknown only when the payload clearly supports that an answer is unknown.",
    "- For enum fields, use exactly one listed allowed value.",
    "- For hs_timezone, output HubSpot's timezone option value, not an IANA display name: lowercase the timezone and replace / with _slash_ and - with _hyphen_ (example: America/Chicago -> america_slash_chicago).",
    "- Dates and datetimes must use ISO-style values when the payload gives enough information.",
    "",
    "Note rules:",
    "- A note is for the real estate agent assigned to this lead, not for the lead.",
    "- Keep it brief: usually 1-3 bullets or 1 short paragraph.",
    "- HubSpot notes are plain text. Do not use Markdown or HTML.",
    "- Use real line breaks for bullets. Put each bullet on its own line starting with '- '.",
    "- Do not use **bold**, *italics*, headings, Markdown links, or inline bullet lists.",
    "- Include only information that helps the agent decide what to do next faster.",
    "- Good notes may suggest the next action, draft the next reply, or summarize important constraints that are scattered across fields/messages.",
    "- Do not write a long essay. Do not list obvious facts already easy to see in the CRM.",
    "- If drafting a reply, put it inside the note; there is no separate reply field.",
    "",
    "Conversation message direction is INCOMING when the contact sent the message and OUTGOING when our side sent it. truncationStatus indicates whether HubSpot truncated the message content.",
    "",
    "HubSpot Field Catalog:",
    formatCatalogForPrompt(WRITABLE_HUBSPOT_PROPERTY_CATALOG),
  ].join("\n");
}

function buildWritebackPlanTool(): HubSpotWritebackPlanToolSchema {
  return {
    name: HUBSPOT_WRITEBACK_PLAN_TOOL_NAME,
    description:
      "Return field updates and/or one brief note for the assigned real estate agent.",
    input_schema: {
      type: "object",
      required: ["kind"],
      properties: {
        kind: {
          type: "string",
          enum: ["writeback", "no_writeback"],
        },
        fieldUpdates: {
          type: "array",
          items: {
            type: "object",
            required: ["name", "value"],
            properties: {
              name: { type: "string" },
              value: {
                type: ["string", "number", "boolean", "null"],
              },
            },
            additionalProperties: false,
          },
        },
        note: { type: "string", minLength: 1 },
        reason: { type: "string", minLength: 1 },
      },
      additionalProperties: false,
    },
  };
}

function formatCatalogForPrompt(
  catalog: readonly WritableHubSpotPropertyCatalogEntry[],
): string {
  return catalog
    .map((entry) => {
      const options = entry.options
        ? ` allowed values=${entry.options.join("|")}`
        : "";
      const updateStatus = isClaudeUpdateableHubSpotPropertyEntry(entry)
        ? "UPDATEABLE"
        : "CONTEXT ONLY - do not return this field in fieldUpdates";
      const guidance = FIELD_GUIDANCE[entry.name]
        ? ` Guidance: ${FIELD_GUIDANCE[entry.name]}`
        : "";
      return `- ${entry.name}: ${entry.label}. ${updateStatus}. type=${entry.type}${options}.${guidance}`;
    })
    .join("\n");
}

const FIELD_GUIDANCE: Record<string, string> = {
  email: "Lead's primary email address.",
  firstname: "Lead's first name.",
  lastname: "Lead's last name.",
  phone: "Lead's primary phone number.",
  mobilephone: "Lead's mobile phone number, especially for text/call preference.",
  address: "Lead's street address when the lead's own address is known.",
  city: "Lead's city.",
  state: "Lead's state or region.",
  zip: "Lead's postal code.",
  country: "Lead's country or region.",
  hs_timezone: "Lead's time zone when explicitly known or safely implied from reliable location data.",
  hs_analytics_source:
    "HubSpot-managed original source attribution. Use as context only; use pd_lead_source_detail for operator-facing source detail.",
  hs_latest_source:
    "HubSpot-managed latest source attribution. Use as context only; use pd_lead_source_detail for operator-facing source detail.",
  pd_transaction_side:
    "Whether the lead is buying, selling, renting, investing, or has more than one transaction side.",
  pd_primary_intent:
    "The main reason the lead reached out, such as requesting a showing, searching to buy, asking about selling, or asking a general question.",
  pd_urgency:
    "How quickly the agent should respond. Reserve high or critical for immediate timing, strong buying/selling intent, or explicit urgency.",
  pd_initial_lead_score:
    "Numeric quality score for the initial lead. Use only when the payload contains enough signal to score confidently.",
  pd_last_enriched_at:
    "System-maintained timestamp for the last successful enrichment. This is not a Claude-editable field.",
  pd_lead_source_detail:
    "Plain-English detail about where the lead came from, such as a campaign, portal, referral source, or listing ad.",
  pd_is_referral:
    "Whether the lead was referred by another person or source.",
  pd_referral_source:
    "Who or what referred the lead when known.",
  pd_preferred_contact_method:
    "How the lead prefers to be contacted: call, text, email, no preference, or unknown.",
  pd_relocation:
    "Whether the lead is moving from one area to another.",
  pd_relocation_destination:
    "Destination city/area for a relocation lead.",
  pd_relocation_deadline:
    "Date by which the relocation needs to happen.",
  pd_interested_listing_id:
    "Listing identifier for the property the lead is asking about.",
  pd_interested_listing_address:
    "Address of the specific listing the lead is interested in.",
  pd_interested_listing_url:
    "URL for the specific listing the lead is interested in.",
  pd_interested_listing_price:
    "Price of the specific listing the lead is interested in.",
  pd_requested_tour_at:
    "Exact requested showing/tour datetime when the lead gives one.",
  pd_requested_tour_window:
    "Requested showing/tour window when the lead gives an inexact time, such as Saturday morning.",
  pd_desired_area:
    "Neighborhood, city, school district, or area the buyer/renter wants.",
  pd_budget_min: "Minimum budget when the lead gives a range.",
  pd_budget_max: "Maximum budget or preapproval amount.",
  pd_financing_status:
    "Whether the lead is cash, preapproved, prequalified, needs financing, unknown, or financing is not applicable.",
  pd_home_to_sell:
    "Whether the buyer has a current home to sell before or during the purchase.",
  pd_buy_readiness:
    "How ready the buyer is to act, from browsing through wants_showing, actively_touring, preapproved, or offer_ready.",
  pd_occupancy_intent:
    "Whether the property is for a primary residence, investment, vacation home, rental, or unknown.",
  pd_bedrooms_min: "Minimum bedroom count requested by the lead.",
  pd_bathrooms_min: "Minimum bathroom count requested by the lead.",
  pd_property_address:
    "Address of a property the lead owns or wants to sell, not necessarily the listing they want to buy.",
  pd_property_type:
    "Type of property involved, such as single_family, condo, townhome, land, or commercial.",
  pd_price_expectation:
    "Seller's expected sale/list price or value expectation when stated.",
  pd_timeline:
    "Plain-English timing details, such as 'wants to move before school starts'.",
  pd_timeframe_bucket:
    "Normalized timing bucket for when the lead wants to buy, sell, rent, or act.",
  pd_sale_readiness:
    "Seller readiness, from exploring value through ready_to_list or already_listed.",
  pd_has_existing_agent:
    "Whether the lead already has a real estate agent.",
  pd_seller_motivation:
    "Seller's stated motivation, such as relocation, upsizing, downsizing, financial, life_event, estate, investment, exploring, or other.",
  pd_seller_property_condition:
    "Condition of the seller's property when stated or clearly described.",
};
