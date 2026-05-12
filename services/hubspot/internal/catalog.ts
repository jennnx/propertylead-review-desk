export type WritableHubSpotPropertySetup = "create" | "verify";

export type WritableHubSpotPropertyType =
  | "bool"
  | "date"
  | "datetime"
  | "enumeration"
  | "number"
  | "string";

export type WritableHubSpotPropertyCatalogEntry = {
  name: string;
  label: string;
  type: WritableHubSpotPropertyType;
  fieldType: string;
  setup: WritableHubSpotPropertySetup;
  options?: string[];
  controlledBy?: "claude" | "system";
};

const standardContactProperties = [
  textProperty("email", "Email", "verify"),
  textProperty("firstname", "First name", "verify"),
  textProperty("lastname", "Last name", "verify"),
  textProperty("phone", "Phone number", "verify"),
  textProperty("mobilephone", "Mobile phone number", "verify"),
  textProperty("address", "Street address", "verify"),
  textProperty("city", "City", "verify"),
  textProperty("state", "State/region", "verify"),
  textProperty("zip", "Postal code", "verify"),
  textProperty("country", "Country/region", "verify"),
  verifyEnumerationProperty("hs_timezone", "Time zone"),
  verifyEnumerationProperty("hs_analytics_source", "Original Traffic Source"),
  verifyEnumerationProperty("hs_latest_source", "Latest Traffic Source"),
] satisfies WritableHubSpotPropertyCatalogEntry[];

const propertyDeskProperties = [
  enumerationProperty("pd_transaction_side", "PropertyDesk Transaction Side", [
    "buyer",
    "seller",
    "buyer_and_seller",
    "renter",
    "investor",
    "unknown",
  ]),
  enumerationProperty("pd_primary_intent", "PropertyDesk Primary Intent", [
    "request_showing",
    "buy_search",
    "sell_inquiry",
    "home_valuation",
    "rental_inquiry",
    "investment_inquiry",
    "agent_contact_request",
    "general_question",
    "unknown",
  ]),
  enumerationProperty("pd_urgency", "PropertyDesk Urgency", [
    "low",
    "normal",
    "high",
    "critical",
    "unknown",
  ]),
  numberProperty("pd_initial_lead_score", "PropertyDesk Initial Lead Score"),
  {
    name: "pd_last_enriched_at",
    label: "PropertyDesk Last Enriched At",
    type: "datetime",
    fieldType: "date",
    setup: "create",
    controlledBy: "system",
  },
  textProperty("pd_lead_source_detail", "PropertyDesk Lead Source Detail", "create"),
  boolProperty("pd_is_referral", "PropertyDesk Is Referral"),
  textProperty("pd_referral_source", "PropertyDesk Referral Source", "create"),
  enumerationProperty(
    "pd_preferred_contact_method",
    "PropertyDesk Preferred Contact Method",
    ["call", "text", "email", "no_preference", "unknown"],
  ),
  boolProperty("pd_relocation", "PropertyDesk Relocation"),
  textProperty("pd_relocation_destination", "PropertyDesk Relocation Destination", "create"),
  dateProperty("pd_relocation_deadline", "PropertyDesk Relocation Deadline"),
  textProperty("pd_interested_listing_id", "PropertyDesk Interested Listing ID", "create"),
  textProperty(
    "pd_interested_listing_address",
    "PropertyDesk Interested Listing Address",
    "create",
  ),
  textProperty("pd_interested_listing_url", "PropertyDesk Interested Listing URL", "create"),
  numberProperty("pd_interested_listing_price", "PropertyDesk Interested Listing Price"),
  {
    name: "pd_requested_tour_at",
    label: "PropertyDesk Requested Tour At",
    type: "datetime",
    fieldType: "date",
    setup: "create",
  },
  textProperty("pd_requested_tour_window", "PropertyDesk Requested Tour Window", "create"),
  textProperty("pd_desired_area", "PropertyDesk Desired Area", "create"),
  numberProperty("pd_budget_min", "PropertyDesk Budget Min"),
  numberProperty("pd_budget_max", "PropertyDesk Budget Max"),
  enumerationProperty("pd_financing_status", "PropertyDesk Financing Status", [
    "cash",
    "preapproved",
    "prequalified",
    "needs_financing",
    "financing_unknown",
    "not_applicable",
  ]),
  boolProperty("pd_home_to_sell", "PropertyDesk Home To Sell"),
  enumerationProperty("pd_buy_readiness", "PropertyDesk Buy Readiness", [
    "browsing",
    "wants_showing",
    "actively_touring",
    "preapproved",
    "offer_ready",
    "not_buying",
    "unknown",
  ]),
  enumerationProperty("pd_occupancy_intent", "PropertyDesk Occupancy Intent", [
    "primary_residence",
    "investment_property",
    "vacation_home",
    "rental",
    "unknown",
  ]),
  numberProperty("pd_bedrooms_min", "PropertyDesk Bedrooms Min"),
  numberProperty("pd_bathrooms_min", "PropertyDesk Bathrooms Min"),
  textProperty("pd_property_address", "PropertyDesk Property Address", "create"),
  enumerationProperty("pd_property_type", "PropertyDesk Property Type", [
    "single_family",
    "condo",
    "townhome",
    "multifamily",
    "land",
    "manufactured",
    "commercial",
    "other",
    "unknown",
  ]),
  numberProperty("pd_price_expectation", "PropertyDesk Price Expectation"),
  {
    name: "pd_timeline",
    label: "PropertyDesk Timeline",
    type: "string",
    fieldType: "textarea",
    setup: "create",
  },
  enumerationProperty("pd_timeframe_bucket", "PropertyDesk Timeframe Bucket", [
    "immediate",
    "within_30_days",
    "one_to_three_months",
    "three_to_six_months",
    "six_plus_months",
    "unknown",
  ]),
  enumerationProperty("pd_sale_readiness", "PropertyDesk Sale Readiness", [
    "exploring_value",
    "considering_sale",
    "ready_to_list",
    "already_listed",
    "not_selling",
    "unknown",
  ]),
  boolProperty("pd_has_existing_agent", "PropertyDesk Has Existing Agent"),
  enumerationProperty("pd_seller_motivation", "PropertyDesk Seller Motivation", [
    "relocation",
    "upsizing",
    "downsizing",
    "financial",
    "life_event",
    "estate",
    "investment",
    "exploring",
    "other",
    "unknown",
  ]),
  enumerationProperty(
    "pd_seller_property_condition",
    "PropertyDesk Seller Property Condition",
    ["excellent", "good", "needs_minor_work", "needs_major_work", "teardown", "unknown"],
  ),
] satisfies WritableHubSpotPropertyCatalogEntry[];

export const HUBSPOT_PROPERTYDESK_PROPERTY_GROUP_NAME =
  "propertydesk_enrichment" as const;

export const HUBSPOT_PROPERTYDESK_PROPERTY_GROUP_LABEL =
  "PropertyDesk Enrichment" as const;

export const WRITABLE_HUBSPOT_PROPERTY_CATALOG = [
  ...standardContactProperties,
  ...propertyDeskProperties,
] as const satisfies readonly WritableHubSpotPropertyCatalogEntry[];

const writablePropertyNames = new Set(
  WRITABLE_HUBSPOT_PROPERTY_CATALOG.map((entry) => entry.name),
);

export function isWritableHubSpotPropertyName(name: string): boolean {
  return writablePropertyNames.has(name);
}

function textProperty(
  name: string,
  label: string,
  setup: WritableHubSpotPropertySetup,
): WritableHubSpotPropertyCatalogEntry {
  return {
    name,
    label,
    type: "string",
    fieldType: "text",
    setup,
  };
}

function numberProperty(
  name: string,
  label: string,
): WritableHubSpotPropertyCatalogEntry {
  return {
    name,
    label,
    type: "number",
    fieldType: "number",
    setup: "create",
  };
}

function boolProperty(
  name: string,
  label: string,
): WritableHubSpotPropertyCatalogEntry {
  return {
    name,
    label,
    type: "bool",
    fieldType: "booleancheckbox",
    setup: "create",
  };
}

function dateProperty(
  name: string,
  label: string,
): WritableHubSpotPropertyCatalogEntry {
  return {
    name,
    label,
    type: "date",
    fieldType: "date",
    setup: "create",
  };
}

function enumerationProperty(
  name: string,
  label: string,
  options: string[],
): WritableHubSpotPropertyCatalogEntry {
  return {
    name,
    label,
    type: "enumeration",
    fieldType: "select",
    setup: "create",
    options,
  };
}

function verifyEnumerationProperty(
  name: string,
  label: string,
): WritableHubSpotPropertyCatalogEntry {
  return {
    name,
    label,
    type: "enumeration",
    fieldType: "select",
    setup: "verify",
  };
}
