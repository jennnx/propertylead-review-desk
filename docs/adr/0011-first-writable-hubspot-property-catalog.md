# 0011 — First Writable HubSpot Property Catalog

**Status**: Accepted

## Context

PropertyLead Review Desk is an AI enrichment layer for the single supported
HubSpot Integration. It reads HubSpot contact state, webhook payloads,
conversation messages, and relevant CRM activity context, then proposes stable
HubSpot contact field updates and a human-facing HubSpot note. HubSpot remains
the source of truth for current lead/contact state; PropertyLead stores
operational trace, AI inputs/outputs, validation results, and writeback logs.

Issue #19 resolves the first concrete **Writable HubSpot Property Catalog** for
HubSpot Writeback Plans. This decision is intentionally product-shaped: later
setup, validation, and Claude-plan code should implement this catalog without
inventing names, ownership rules, or field semantics.

HubSpot API constraints that shape this decision:

- Contact records are CRM object `0-1` / `contacts`; notes are CRM activity
  object `0-46`.
- Custom contact properties are created through the properties API and require
  `groupName`, `name`, `label`, `type`, and `fieldType`.
- HubSpot property `type` and `fieldType` are separate. For this catalog,
  relevant types are `string`, `number`, `date`, `datetime`, `bool`, and
  `enumeration`.
- Conversation threads and messages are Conversations API resources, not CRM
  contact properties. They provide enrichment input context, including
  thread/message IDs, message text/rich text, direction, actors, timestamps,
  and truncation status.
- Some HubSpot source attribution drill-down properties are HubSpot-calculated
  or portal-specific. They are useful attribution context, but this catalog uses
  `pd_lead_source_detail` when PropertyDesk needs its own operator-facing
  source detail.

Sources consulted:

- HubSpot Contacts API: https://developers.hubspot.com/docs/api-reference/crm-contacts-v3/guide
- HubSpot Properties API: https://developers.hubspot.com/docs/api-reference/latest/crm/properties/guide
- HubSpot Object APIs: https://developers.hubspot.com/docs/api-reference/crm-objects-v3/guide
- HubSpot Conversations APIs: https://developers.hubspot.com/docs/guides/api/conversations/inbox-and-messages
- HubSpot default contact properties: https://knowledge.hubspot.com/properties/hubspots-default-contact-properties
- Zillow lead/tour flow: https://www.zillow.com/premier-agent/when-buyers-contact-premier-agent/
- Redfin tour request flow: https://support.redfin.com/hc/en-us/articles/360001432232-Scheduling-a-Tour
- NAR 2025 buyer/seller source patterns: https://www.nar.realtor/sites/default/files/2025-04/2025-home-buyers-and-sellers-generational-trends-04-01-2025.pdf

## Decision

Use one static Writable HubSpot Property Catalog for contact properties that
Claude may propose in HubSpot Writeback Plans.

Catalog entries are stable contact, lead, property, preference, source, or
classification attributes that an operator may reasonably use in HubSpot views,
filters, or ordering. The catalog is not a list of every fact Claude may
understand. Event-specific interpretation belongs in HubSpot notes and internal
logs.

Examples that belong in HubSpot notes, not fields:

- Suggested replies.
- Recommended next action.
- Event summary.
- Missing information to ask now.
- Reasoning or confidence explanation.
- Narrative source summary.
- Urgency rationale.

Runtime workflow processing must use this static catalog. It must not expand
writable properties dynamically based on live HubSpot property discovery,
conversation content, Claude output, or prompt-time reasoning.

Every field update writeback attempt must log the field name, previous HubSpot
value, proposed value, and result. This before/after log is required even though
Claude is expected to act sensibly, because rollback, audit, and eval workflows
depend on exact writeback trace.

## Ownership

PropertyDesk-owned `pd_*` entries are custom HubSpot contact properties.
Setup may create missing `pd_*` properties from this catalog in a dedicated
PropertyDesk property group.

Use this group:

| Field | Value |
| --- | --- |
| `groupName` | `propertydesk_enrichment` |
| Label | `PropertyDesk Enrichment` |

Standard HubSpot contact fields are verification-only. Setup must verify that
they exist in the target HubSpot portal and have compatible property metadata.
Setup must not create or redefine HubSpot standard properties.

## Standard HubSpot Contact Properties

These standard contact properties may be targeted by HubSpot Writeback Plans
when portal metadata verifies they are the expected contact properties.

| Name | Label | Expected metadata | Intended use | Verification constraints |
| --- | --- | --- | --- | --- |
| `email` | Email | String/text-compatible contact property. | Stable identity and dedupe signal. | Verify it is a contact property. |
| `firstname` | First name | String/text-compatible contact property. | Stable contact identity, including names inferred from signatures or messages. | Verify it is a contact property. |
| `lastname` | Last name | String/text-compatible contact property. | Stable contact identity, including names inferred from signatures or messages. | Verify it is a contact property. |
| `phone` | Phone number | String/text-compatible contact property. | Stable phone contact detail. | Verify it is a contact property. |
| `mobilephone` | Mobile phone number | String/text-compatible contact property. | Stable mobile/text contact detail. | Verify it is a contact property. |
| `address` | Street address | String/text-compatible contact property. | Contact mailing/location address, not necessarily the property of interest. | Verify it is a contact property. |
| `city` | City | String/text-compatible contact property. | Contact mailing/location city. | Verify it is a contact property. |
| `state` | State/region | String/text-compatible contact property. | Contact mailing/location state or region. | Verify it is a contact property. |
| `zip` | Postal code | String/text-compatible contact property. | Contact mailing/location postal code. | Verify it is a contact property. |
| `country` | Country/region | String/text-compatible contact property. | Contact mailing/location country. | Verify it is a contact property. |
| `hs_timezone` | Time zone | Contact property with portal-defined allowed values when options exist. | Stable contact time zone for outreach timing. | Verify it is a contact property and use allowed portal values. |
| `hs_analytics_source` | Original Traffic Source | Contact property with portal-defined allowed values when options exist. | First known traffic/source category when a correction is appropriate. | Verify it is a contact property and use allowed portal values. |
| `hs_latest_source` | Latest Traffic Source | Contact property with portal-defined allowed values when options exist. | Most recent traffic/source category when a correction is appropriate. | Verify it is a contact property and use allowed portal values. |

HubSpot source drill-down fields such as `hs_analytics_source_data_1`,
`hs_analytics_source_data_2`, `hs_latest_source_data_1`, and
`hs_latest_source_data_2` should be fetched as enrichment input context when
available. Use `pd_lead_source_detail` for a PropertyDesk-owned
operator-facing source detail.

Do not include HubSpot owner, lifecycle stage, lead status, tasks, thread
status, routing, SLA, or workflow fields in this catalog. Those belong to CRM
operations and existing brokerage process, not PropertyDesk enrichment.

## PropertyDesk Custom Contact Properties

All `pd_*` entries below are creatable by setup if missing.

For enum fields, use the option `value` strings exactly as listed. Operators may
rename labels later in HubSpot if needed, but code and validation should use
internal values.

### Lead Classification

| Name | Label | Type | Field type | Options / constraints | Intended use |
| --- | --- | --- | --- | --- | --- |
| `pd_transaction_side` | PropertyDesk Transaction Side | `enumeration` | `select` | `buyer`, `seller`, `buyer_and_seller`, `renter`, `investor`, `unknown` | Stable top-level real estate role. |
| `pd_primary_intent` | PropertyDesk Primary Intent | `enumeration` | `select` | `request_showing`, `buy_search`, `sell_inquiry`, `home_valuation`, `rental_inquiry`, `investment_inquiry`, `agent_contact_request`, `general_question`, `unknown` | Main reason this contact appears to be engaging. |
| `pd_urgency` | PropertyDesk Urgency | `enumeration` | `select` | `low`, `normal`, `high`, `critical`, `unknown` | Operator-visible time sensitivity, derived from stable evidence such as deadlines, relocation, or stated timing. |
| `pd_initial_lead_score` | PropertyDesk Initial Lead Score | `number` | `number` | Integer `0` through `10`; empty when insufficient signal. | Intake snapshot for filtering/sorting promising or actionable leads. Do not rewrite continuously after every event. |
| `pd_last_enriched_at` | PropertyDesk Last Enriched At | `datetime` | `date` | UTC datetime. | Timestamp of the last successful PropertyDesk enrichment writeback. |

### Source And Referral

| Name | Label | Type | Field type | Options / constraints | Intended use |
| --- | --- | --- | --- | --- | --- |
| `pd_lead_source_detail` | PropertyDesk Lead Source Detail | `string` | `text` | Short source detail, e.g. portal, form, campaign, open house, referral context. | Operator-facing source detail when HubSpot standard source fields are too coarse. |
| `pd_is_referral` | PropertyDesk Is Referral | `bool` | `booleancheckbox` | `true`, `false`, or empty when unknown. | Filter referral leads, which are commonly meaningfully different from cold portal/form leads. |
| `pd_referral_source` | PropertyDesk Referral Source | `string` | `text` | Person, organization, agent, employer, or channel that referred the lead. | Stable referral attribution visible to the operator. |

### Contact Preference And Relocation

| Name | Label | Type | Field type | Options / constraints | Intended use |
| --- | --- | --- | --- | --- | --- |
| `pd_preferred_contact_method` | PropertyDesk Preferred Contact Method | `enumeration` | `select` | `call`, `text`, `email`, `no_preference`, `unknown` | Stable stated communication preference. |
| `pd_relocation` | PropertyDesk Relocation | `bool` | `booleancheckbox` | `true`, `false`, or empty when unknown. | Filter relocation leads, often high urgency and context-heavy. |
| `pd_relocation_destination` | PropertyDesk Relocation Destination | `string` | `text` | Destination city, region, state, or country if stated. | Stable relocation context. |
| `pd_relocation_deadline` | PropertyDesk Relocation Deadline | `date` | `date` | UTC date at midnight. | Stated relocation deadline. |

### Listing And Tour Interest

| Name | Label | Type | Field type | Options / constraints | Intended use |
| --- | --- | --- | --- | --- | --- |
| `pd_interested_listing_id` | PropertyDesk Interested Listing ID | `string` | `text` | Source listing ID, MLS ID, portal ID, or other durable listing identifier. | Listing-specific inquiry context. |
| `pd_interested_listing_address` | PropertyDesk Interested Listing Address | `string` | `text` | Listing/property address from source event or conversation. | Human-readable listing interest when ID is unavailable or insufficient. |
| `pd_interested_listing_url` | PropertyDesk Interested Listing URL | `string` | `text` | Absolute URL when supplied. | Link back to listing/source context. |
| `pd_interested_listing_price` | PropertyDesk Interested Listing Price | `number` | `number` | Numeric currency amount only; no symbols. | Listing price anchor for buyer inquiry context. |
| `pd_requested_tour_at` | PropertyDesk Requested Tour At | `datetime` | `date` | UTC datetime when an exact preferred tour time exists. | Requested showing/tour time from portal or message. |
| `pd_requested_tour_window` | PropertyDesk Requested Tour Window | `string` | `text` | Short natural-language window when an exact datetime is unavailable. | Requested showing/tour availability, e.g. "Saturday afternoon". |

Tour request status is intentionally excluded. A requested tour time/window is
stable lead intent; tour lifecycle status is operational workflow state.

### Buyer Search And Financing

| Name | Label | Type | Field type | Options / constraints | Intended use |
| --- | --- | --- | --- | --- | --- |
| `pd_desired_area` | PropertyDesk Desired Area | `string` | `text` | Target neighborhood, city, school district, ZIP, or area phrase. | Buyer/renter search geography. |
| `pd_budget_min` | PropertyDesk Budget Min | `number` | `number` | Numeric currency amount only; no symbols. | Lower bound of stated purchase/rental budget. |
| `pd_budget_max` | PropertyDesk Budget Max | `number` | `number` | Numeric currency amount only; no symbols. | Upper bound of stated purchase/rental budget. |
| `pd_financing_status` | PropertyDesk Financing Status | `enumeration` | `select` | `cash`, `preapproved`, `prequalified`, `needs_financing`, `financing_unknown`, `not_applicable` | High-level financing readiness. Detailed down-payment or lender notes remain in the HubSpot note. |
| `pd_home_to_sell` | PropertyDesk Home To Sell | `bool` | `booleancheckbox` | `true`, `false`, or empty when unknown. | Whether a buyer also needs to sell a current home. |
| `pd_buy_readiness` | PropertyDesk Buy Readiness | `enumeration` | `select` | `browsing`, `wants_showing`, `actively_touring`, `preapproved`, `offer_ready`, `not_buying`, `unknown` | Stable buyer readiness classification. |
| `pd_occupancy_intent` | PropertyDesk Occupancy Intent | `enumeration` | `select` | `primary_residence`, `investment_property`, `vacation_home`, `rental`, `unknown` | Intended use of the property. |
| `pd_bedrooms_min` | PropertyDesk Bedrooms Min | `number` | `number` | Non-negative number. | Minimum bedrooms when stated. |
| `pd_bathrooms_min` | PropertyDesk Bathrooms Min | `number` | `number` | Non-negative number; decimals allowed for half baths. | Minimum bathrooms when stated. |

Do not add `pd_down_payment_status` in the first catalog. Down payment detail is
usually a financing sub-detail rather than a top-level intake filter. Capture it
in the HubSpot note unless later operator usage proves it deserves a field.

### Seller And Property Details

| Name | Label | Type | Field type | Options / constraints | Intended use |
| --- | --- | --- | --- | --- | --- |
| `pd_property_address` | PropertyDesk Property Address | `string` | `text` | Seller property address or other primary property address relevant to the lead. | Stable property-of-interest address. |
| `pd_property_type` | PropertyDesk Property Type | `enumeration` | `select` | `single_family`, `condo`, `townhome`, `multifamily`, `land`, `manufactured`, `commercial`, `other`, `unknown` | Property type for buyer or seller context. |
| `pd_price_expectation` | PropertyDesk Price Expectation | `number` | `number` | Numeric currency amount only; no symbols. | Seller stated expected price or valuation anchor. |
| `pd_timeline` | PropertyDesk Timeline | `string` | `textarea` | Short stated timeline phrase. | Human-readable stated buy/sell/move timing. |
| `pd_timeframe_bucket` | PropertyDesk Timeframe Bucket | `enumeration` | `select` | `immediate`, `within_30_days`, `one_to_three_months`, `three_to_six_months`, `six_plus_months`, `unknown` | Filterable normalized timing bucket. |
| `pd_sale_readiness` | PropertyDesk Sale Readiness | `enumeration` | `select` | `exploring_value`, `considering_sale`, `ready_to_list`, `already_listed`, `not_selling`, `unknown` | Stable seller readiness classification. |
| `pd_has_existing_agent` | PropertyDesk Has Existing Agent | `bool` | `booleancheckbox` | `true`, `false`, or empty when unknown. | Whether the lead appears already represented by another agent. |
| `pd_seller_motivation` | PropertyDesk Seller Motivation | `enumeration` | `select` | `relocation`, `upsizing`, `downsizing`, `financial`, `life_event`, `estate`, `investment`, `exploring`, `other`, `unknown` | High-level seller motivation when stated or strongly inferable. |
| `pd_seller_property_condition` | PropertyDesk Seller Property Condition | `enumeration` | `select` | `excellent`, `good`, `needs_minor_work`, `needs_major_work`, `teardown`, `unknown` | Coarse property condition from seller context. |

Detailed property must-haves, seller narrative, condition explanation, and
motivation rationale belong in the HubSpot note.

## Plan Validation And Prompt Guidance

HubSpot Writeback Plan validation should enforce the catalog contract:

- Field updates may target only names in this catalog.
- `pd_*` field metadata must match this ADR exactly.
- Standard HubSpot fields must be verified from portal metadata before use.
- Enum values must use the internal option values listed above.
- Number fields must be numeric and must not include currency symbols or prose.
- `pd_initial_lead_score` must be an integer from `0` through `10`, or omitted
  when there is not enough signal.
- Date and datetime values must be normalized to HubSpot-compatible UTC values.
- Boolean fields may be `true`, `false`, or omitted/cleared when unknown.
- `pd_last_enriched_at` is system-controlled and should be set by application
  code, not by Claude reasoning.
- Field updates and note creation may appear together in one HubSpot Writeback
  Plan.
- No-writeback reasoning is mutually exclusive with field updates and note
  creation.

Do not build a second policy layer that tries to micromanage which catalog
fields Claude is allowed to change in normal operation. Claude should receive
the current field values, relevant context, this catalog, and general guidance:

- Leave existing values alone unless the provided information gives clear
  evidence to add, correct, or improve the value.
- Update stable attributes, not event-specific advice.
- Put suggested replies, next actions, missing-info prompts, explanations, and
  narrative summaries in the HubSpot note.
- Do not use the writable field catalog to control owners, lifecycle stages,
  tasks, routing, SLAs, or other brokerage workflow state.

If HubSpot rejects a proposed field update because of portal permissions,
property settings, validation, or provider behavior, record the attempted field,
previous value, proposed value, provider response, and failure result in the
writeback log. That failure should inform future catalog or setup changes; it
should not become a reason to invent ad hoc runtime field policy.

## Enrichment Context Outside The Writable Catalog

The workflow should still read more than the writable catalog. In particular,
it should read:

- Current HubSpot contact properties needed to understand the event and contact,
  including source attribution and analytics fields when they explain where the
  lead came from or why the event matters.
- Existing values for every available catalog field, including standard fields
  and previously-created `pd_*` fields, so Claude can decide whether an update
  adds or improves stable contact context.
- Bounded HubSpot Conversations thread/message context, including message
  metadata and truncation status.
- Relevant previous HubSpot notes associated with the contact.
- Raw webhook and normalized event data.

These inputs help Claude decide whether a catalog update or note is useful.
They do not automatically become writable properties.

## Catalog Evolution

This catalog is the current approved field vocabulary, not a permanent schema
for all future time. The point is to prevent Claude, setup code, and
implementation agents from making up random HubSpot field names on the fly.

If later product work, customer examples, evals, or portal setup shows that the
catalog missed an important stable attribute, add it here first and then update
setup and validation. If the target brokerage already has an equivalent custom
property, prefer mapping to that existing field over creating a redundant
`pd_*` property.

## Consequences

This catalog is broad enough to capture meaningful real estate intake context
for operators while still excluding unstable event assistance and CRM workflow
state. It supports filtering and ordering in HubSpot without turning
PropertyLead Review Desk into the system of record for operational tasks,
routing, stages, or agent process.

The catalog also gives implementation agents a concrete contract for:

- Setup behavior.
- Claude prompt constraints.
- HubSpot Writeback Plan validation.
- Before/after writeback logging.
- Future evals around whether field updates were useful and conservative.
