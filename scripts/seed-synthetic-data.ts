// Seed synthetic HubSpot webhook → workflow run → writeback rows so the
// Review Desk + dashboards have realistic history when the dev box is empty.
//
// Generates 5–15 events per day across the past 7 days (inclusive of today),
// with a realistic mix of writeback outcomes and review states. Run with:
//
//   pnpm tsx scripts/seed-synthetic-data.ts
//
// Idempotency: each run inserts new rows; nothing is upserted. Delete the
// rows manually if you want to start over.

import { randomBytes, randomUUID } from "node:crypto";

import { config as loadDotenv } from "dotenv";
import { Client } from "pg";

loadDotenv({ override: true, quiet: true });

const PORTAL_ID = "245580521";

type PlanFieldUpdate = {
  name: string;
  value: string | number | boolean | null;
};

type WritebackPlan =
  | {
      kind: "writeback";
      fieldUpdates: PlanFieldUpdate[];
      note: string;
      reason: string;
    }
  | {
      kind: "no_writeback";
      reason: string;
    };

type ContactProps = {
  firstname: string | null;
  lastname: string | null;
  email: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
};

type SyntheticEvent = {
  dayOffset: number;
  hour: number;
  minute: number;
  trigger: "contact.created" | "conversation.message.received";
  contact: ContactProps;
  messageText?: string;
  plan: WritebackPlan;
  finalState: "PENDING" | "APPLIED" | "AUTO_APPLIED" | "REJECTED";
  reviewNote?: string | null;
};

// --------------------------------------------------------------------------
// Scenario library — realistic-sounding leads. Each entry produces exactly
// one synthetic event. The seeder slices the array into per-day batches.
// --------------------------------------------------------------------------

const events: SyntheticEvent[] = [
  // Day -6 (May 8) — 7 events
  {
    dayOffset: -6,
    hour: 8,
    minute: 12,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Priya",
      lastname: "Raman",
      email: "priya.raman@protonmail.com",
      phone: "+14155553112",
      city: "San Francisco",
      state: "CA",
    },
    messageText:
      "Hi - I came across your listing at 1248 Guerrero and I'd love to tour it this weekend if it's still available. We're pre-approved up to $1.4M through Wells Fargo and ready to move on the right place. Saturday afternoon works best.",
    plan: writebackPlan({
      reason:
        "Direct showing request on a specific listing with pre-approval and a concrete window. Many empty fields can be filled in.",
      note:
        "Tour request for 1248 Guerrero this Saturday afternoon. Pre-approved up to $1.4M (Wells Fargo). Confirm availability and propose a 2–4pm window.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "request_showing" },
        { name: "pd_urgency", value: "high" },
        { name: "pd_initial_lead_score", value: 82 },
        { name: "pd_buy_readiness", value: "wants_showing" },
        { name: "pd_financing_status", value: "preapproved" },
        { name: "pd_budget_max", value: 1400000 },
        { name: "pd_interested_listing_address", value: "1248 Guerrero St, San Francisco, CA" },
        { name: "pd_preferred_contact_method", value: "email" },
        { name: "pd_requested_tour_window", value: "Saturday afternoon" },
        { name: "pd_timeframe_bucket", value: "immediate" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -6,
    hour: 9,
    minute: 41,
    trigger: "contact.created",
    contact: {
      firstname: "Marcus",
      lastname: "Holloway",
      email: "mholloway@hellofresh-ops.com",
    },
    plan: writebackPlan({
      reason:
        "Contact created with only firstname/lastname/email — no message content yet. Initial-score and source-detail are the safe fills.",
      note: "New contact created from web form. No message yet — waiting on follow-up.",
      fieldUpdates: [
        { name: "pd_primary_intent", value: "unknown" },
        { name: "pd_initial_lead_score", value: 35 },
        { name: "pd_lead_source_detail", value: "Web form, no message body submitted" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -6,
    hour: 11,
    minute: 3,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Daniella",
      lastname: "Wu",
      email: "dani.wu@gmail.com",
      phone: "+16505558890",
    },
    messageText:
      "Hey, my partner and I are thinking about selling our condo in Hayes Valley — 2BR/2BA, top floor, parking. We're not in a rush but want to understand what it might list for in this market. Could you put together a quick valuation? We bought it in 2019.",
    plan: writebackPlan({
      reason:
        "Clear seller-side valuation inquiry. Property details and exploratory timeline let us populate many seller fields.",
      note:
        "Hayes Valley 2BR/2BA condo, top floor + parking. Bought 2019. Wants valuation, not in a rush. Propose CMA + a 30-min seller intro call.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "seller" },
        { name: "pd_primary_intent", value: "home_valuation" },
        { name: "pd_urgency", value: "normal" },
        { name: "pd_initial_lead_score", value: 68 },
        { name: "pd_sale_readiness", value: "exploring_value" },
        { name: "pd_property_type", value: "condo" },
        { name: "pd_bedrooms_min", value: 2 },
        { name: "pd_bathrooms_min", value: 2 },
        { name: "pd_desired_area", value: "Hayes Valley, San Francisco" },
        { name: "pd_timeframe_bucket", value: "three_to_six_months" },
        { name: "pd_seller_motivation", value: "exploring" },
        { name: "pd_seller_property_condition", value: "good" },
        { name: "pd_has_existing_agent", value: false },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -6,
    hour: 13,
    minute: 27,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Tomás",
      lastname: "Aguilar",
      email: "tomas.aguilar@nimbus.studio",
    },
    messageText:
      "thanks for the quick reply! Saturday at 2 works perfect, see you then.",
    plan: noWriteback({
      reason:
        "Confirmation reply on an existing tour booking — no new structured data to capture, and the operator already has full context in the thread.",
    }),
    finalState: "PENDING",
  },
  {
    dayOffset: -6,
    hour: 14,
    minute: 55,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Rebecca",
      lastname: "Stein",
      email: "r.stein@gmail.com",
      phone: "+12065557721",
    },
    messageText:
      "Hi — we're relocating from Seattle in late August (my husband took a job at UCSF). We need a 4BR with at least a small yard, ideally Noe Valley or Glen Park. Budget around $1.8–2.2M, financing through First Republic. Two kids (5 and 8) so school district matters. When can we set up some tours, maybe weekend of the 19th?",
    plan: writebackPlan({
      reason:
        "Out-of-state relocation buyer with strong specifics: timeline, geography, budget, financing, family context. Worth filling everything we can.",
      note:
        "Relocation from Seattle (UCSF role, husband). Wants 4BR + yard in Noe Valley or Glen Park, $1.8–2.2M, financing via First Republic. Two kids — school district matters. Targeting tour weekend of the 19th. Pull listings + arrange Saturday/Sunday tour block.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "buy_search" },
        { name: "pd_urgency", value: "high" },
        { name: "pd_initial_lead_score", value: 88 },
        { name: "pd_relocation", value: true },
        { name: "pd_relocation_destination", value: "San Francisco, CA" },
        { name: "pd_desired_area", value: "Noe Valley or Glen Park" },
        { name: "pd_budget_min", value: 1800000 },
        { name: "pd_budget_max", value: 2200000 },
        { name: "pd_financing_status", value: "preapproved" },
        { name: "pd_bedrooms_min", value: 4 },
        { name: "pd_property_type", value: "single_family" },
        { name: "pd_buy_readiness", value: "wants_showing" },
        { name: "pd_occupancy_intent", value: "primary_residence" },
        { name: "pd_timeframe_bucket", value: "one_to_three_months" },
        { name: "pd_timeline", value: "Move-in late August; tours week of the 19th" },
        { name: "pd_preferred_contact_method", value: "email" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -6,
    hour: 16,
    minute: 14,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Avery",
      lastname: "Brooks",
      email: "avery.brooks.realestate@gmail.com",
    },
    messageText:
      "Hi - I'm an agent at Pacific Union representing a client interested in your listing at 27 Crestmont. Could you send the disclosure package?",
    plan: writebackPlan({
      reason:
        "Inquiry from a buyer's agent — not a direct consumer lead. Mark side/intent appropriately and flag the existing-agent signal.",
      note:
        "Buyer's agent at Pacific Union asking for the disclosure package on 27 Crestmont. Send package; not a direct-consumer lead.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "agent_contact_request" },
        { name: "pd_urgency", value: "normal" },
        { name: "pd_initial_lead_score", value: 40 },
        { name: "pd_has_existing_agent", value: true },
        { name: "pd_interested_listing_address", value: "27 Crestmont Dr, San Francisco, CA" },
        { name: "pd_lead_source_detail", value: "Cooperating agent disclosure request" },
      ],
    }),
    finalState: "REJECTED",
    reviewNote:
      "Rejecting — we don't enrich cooperating-agent inquiries. Just forward the disclosure package and skip the writeback.",
  },
  {
    dayOffset: -6,
    hour: 19,
    minute: 22,
    trigger: "conversation.message.received",
    contact: {
      firstname: null,
      lastname: null,
      email: "hello@quickleadgen.io",
    },
    messageText:
      "Boost your real estate sales with our SEO services — guaranteed first-page rankings!",
    plan: noWriteback({
      reason:
        "Cold outbound SEO pitch, not a real lead. No usable contact info and nothing to enrich.",
    }),
    finalState: "PENDING",
  },

  // Day -5 (May 9) — 9 events
  {
    dayOffset: -5,
    hour: 7,
    minute: 48,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Liam",
      lastname: "Castellano",
      email: "lcastellano84@gmail.com",
      phone: "+14157759812",
    },
    messageText:
      "Following up on our chat last week — I talked it over with my wife and we're ready to make an offer on 419 Diamond St. Can we get on a call today to walk through what we should come in at?",
    plan: writebackPlan({
      reason:
        "Returning buyer transitioning to offer stage. Update readiness and urgency; capture the listing in scope.",
      note:
        "Liam ready to make an offer on 419 Diamond. Get on a call today — prep comps and recommended offer band before the call.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "buy_search" },
        { name: "pd_urgency", value: "critical" },
        { name: "pd_initial_lead_score", value: 92 },
        { name: "pd_buy_readiness", value: "offer_ready" },
        { name: "pd_interested_listing_address", value: "419 Diamond St, San Francisco, CA" },
        { name: "pd_preferred_contact_method", value: "call" },
        { name: "pd_timeframe_bucket", value: "immediate" },
      ],
    }),
    finalState: "AUTO_APPLIED",
  },
  {
    dayOffset: -5,
    hour: 9,
    minute: 6,
    trigger: "contact.created",
    contact: {
      firstname: "Ines",
      lastname: "Mahmoud",
      email: "ines.mahmoud@kerncapital.com",
    },
    plan: writebackPlan({
      reason: "New contact with no message yet. Set baseline score from a presumed corporate inbound.",
      note: "Contact created from web form — corporate email domain. No message body yet.",
      fieldUpdates: [
        { name: "pd_initial_lead_score", value: 30 },
        { name: "pd_primary_intent", value: "unknown" },
        { name: "pd_lead_source_detail", value: "Web form (no message body)" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -5,
    hour: 10,
    minute: 33,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Dean",
      lastname: "Whitaker",
      email: "dean.whitaker@whitakerholdings.net",
      phone: "+19255558810",
    },
    messageText:
      "Looking for a 4-6 unit multifamily in the East Bay (Oakland or Berkeley), cash buyer, up to $2.5M. Class B+ neighborhoods, value-add ok. Send me anything you have on or off market.",
    plan: writebackPlan({
      reason:
        "Investor cash buyer with clear criteria. Captures investment intent and side cleanly.",
      note:
        "Cash investor — 4–6 unit multifamily in Oakland/Berkeley up to $2.5M, value-add ok. Open to off-market. Run inventory; flag pocket listings.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "investor" },
        { name: "pd_primary_intent", value: "investment_inquiry" },
        { name: "pd_urgency", value: "high" },
        { name: "pd_initial_lead_score", value: 78 },
        { name: "pd_property_type", value: "multifamily" },
        { name: "pd_financing_status", value: "cash" },
        { name: "pd_budget_max", value: 2500000 },
        { name: "pd_desired_area", value: "Oakland or Berkeley (East Bay)" },
        { name: "pd_occupancy_intent", value: "investment_property" },
        { name: "pd_buy_readiness", value: "actively_touring" },
      ],
    }),
    finalState: "AUTO_APPLIED",
  },
  {
    dayOffset: -5,
    hour: 11,
    minute: 47,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Sasha",
      lastname: "Petrov",
      email: "sasha.petrov@hey.com",
    },
    messageText: "just looking, no rush",
    plan: writebackPlan({
      reason:
        "Low-signal browsing message but does establish readiness and urgency — small writeback worth applying.",
      note: "Low-intent browser — no specific criteria yet. Send the monthly market digest and revisit in 30 days.",
      fieldUpdates: [
        { name: "pd_urgency", value: "low" },
        { name: "pd_initial_lead_score", value: 20 },
        { name: "pd_buy_readiness", value: "browsing" },
        { name: "pd_timeframe_bucket", value: "six_plus_months" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -5,
    hour: 13,
    minute: 18,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Kenji",
      lastname: "Yamamoto",
      email: "kenji.yamamoto@stanford.edu",
    },
    messageText:
      "Hi, I'm finishing my postdoc at Stanford in December and looking to rent in Palo Alto or Menlo Park for a year before deciding whether to buy. 1BR is fine, budget around $3,200/mo. Anything I should look at?",
    plan: writebackPlan({
      reason:
        "Rental inquiry with potential future-buyer signal. Capture rental intent and the longer-term buy timeline.",
      note:
        "Renter for a year (Dec start) in Palo Alto/Menlo Park, 1BR ~$3,200/mo. Postdoc at Stanford. Likely a buyer 12+ months out. Send rental options + drop into the long-horizon nurture.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "renter" },
        { name: "pd_primary_intent", value: "rental_inquiry" },
        { name: "pd_urgency", value: "normal" },
        { name: "pd_initial_lead_score", value: 45 },
        { name: "pd_desired_area", value: "Palo Alto or Menlo Park" },
        { name: "pd_bedrooms_min", value: 1 },
        { name: "pd_timeframe_bucket", value: "three_to_six_months" },
        { name: "pd_occupancy_intent", value: "rental" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -5,
    hour: 14,
    minute: 51,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Hannah",
      lastname: "Greer",
      email: "hannah.greer@outlook.com",
      phone: "+14087758833",
    },
    messageText:
      "Quick question — can someone confirm the HOA fee on the Mission Bay listing (1 Mission Bay Blvd, unit 1402)? My agent and I are running numbers tonight.",
    plan: writebackPlan({
      reason: "Hannah already has representation — capture that and the listing she's evaluating.",
      note:
        "Hannah is working with her own agent and asking about HOA on 1 Mission Bay #1402. Send the HOA disclosure tonight; do not pursue as a direct lead.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "general_question" },
        { name: "pd_urgency", value: "normal" },
        { name: "pd_initial_lead_score", value: 30 },
        { name: "pd_has_existing_agent", value: true },
        { name: "pd_interested_listing_address", value: "1 Mission Bay Blvd #1402, San Francisco, CA" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -5,
    hour: 16,
    minute: 9,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Olu",
      lastname: "Adebayo",
      email: "olu.adebayo@quantelio.com",
    },
    messageText:
      "Hi, my mom passed away last month and we're going to need to sell her place in Daly City. 3BR/1BA, lived in since 1986, needs work. The family lawyer said we should start getting it valued. Can you help?",
    plan: writebackPlan({
      reason:
        "Sensitive estate sale — capture motivation and condition so the operator can prepare the right intro.",
      note:
        "Estate sale — Daly City 3BR/1BA, lived in since 1986, needs work. Family is at the start of the probate process. Recommend an in-person walkthrough next week; be compassionate, lead with a CMA + light-rehab vs. as-is comparison.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "seller" },
        { name: "pd_primary_intent", value: "home_valuation" },
        { name: "pd_urgency", value: "normal" },
        { name: "pd_initial_lead_score", value: 72 },
        { name: "pd_sale_readiness", value: "considering_sale" },
        { name: "pd_property_type", value: "single_family" },
        { name: "pd_bedrooms_min", value: 3 },
        { name: "pd_bathrooms_min", value: 1 },
        { name: "pd_seller_motivation", value: "estate" },
        { name: "pd_seller_property_condition", value: "needs_major_work" },
        { name: "pd_desired_area", value: "Daly City, CA" },
        { name: "pd_timeframe_bucket", value: "one_to_three_months" },
        { name: "pd_has_existing_agent", value: false },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -5,
    hour: 18,
    minute: 4,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Marisol",
      lastname: "Vega",
      email: "marisol.vega@gmail.com",
    },
    messageText: "wrong number sorry",
    plan: noWriteback({
      reason: "Wrong-number reply. Nothing to enrich and no follow-up needed.",
    }),
    finalState: "PENDING",
  },
  {
    dayOffset: -5,
    hour: 20,
    minute: 39,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Garrett",
      lastname: "Liu",
      email: "garrett.liu@brexmail.com",
    },
    messageText:
      "Came across the open house at 60 Rausch — what's the seller flexibility on price? Asking is $1.6M but I'm seeing comparable units in Mission Bay close 5–8% under list.",
    plan: writebackPlan({
      reason:
        "Negotiation-stage buyer. Capture listing, price-band signal, and that this is a buy_search lead.",
      note:
        "Garrett evaluating 60 Rausch (list $1.6M); cited 5–8% under-list Mission Bay comps. Reply with comp summary + a feel for seller motivation; offer a call.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "buy_search" },
        { name: "pd_urgency", value: "high" },
        { name: "pd_initial_lead_score", value: 76 },
        { name: "pd_buy_readiness", value: "actively_touring" },
        { name: "pd_interested_listing_address", value: "60 Rausch St, San Francisco, CA" },
        { name: "pd_interested_listing_price", value: 1600000 },
        { name: "pd_budget_max", value: 1600000 },
      ],
    }),
    finalState: "APPLIED",
  },

  // Day -4 (May 10) — 11 events
  {
    dayOffset: -4,
    hour: 7,
    minute: 21,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Aanya",
      lastname: "Shah",
      email: "aanya.shah@gmail.com",
      phone: "+16505511234",
    },
    messageText:
      "Hi — saw your listing on Zillow for 2200 Pacific. We are first-time buyers, just got pre-qualified for $1.1M. Looking for 2BR in Pacific Heights or Russian Hill, ideally with parking. Can we tour next Wednesday evening?",
    plan: writebackPlan({
      reason: "First-time buyer with clear criteria, budget, and a tour-window ask.",
      note:
        "Aanya — first-time buyer, prequalified $1.1M, 2BR Pacific Heights/Russian Hill w/ parking. Wants Wednesday evening tour. Propose 6 or 6:30pm slot.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "request_showing" },
        { name: "pd_urgency", value: "high" },
        { name: "pd_initial_lead_score", value: 75 },
        { name: "pd_buy_readiness", value: "wants_showing" },
        { name: "pd_financing_status", value: "prequalified" },
        { name: "pd_budget_max", value: 1100000 },
        { name: "pd_bedrooms_min", value: 2 },
        { name: "pd_desired_area", value: "Pacific Heights or Russian Hill" },
        { name: "pd_interested_listing_address", value: "2200 Pacific Ave, San Francisco, CA" },
        { name: "pd_requested_tour_window", value: "Next Wednesday evening" },
        { name: "pd_occupancy_intent", value: "primary_residence" },
        { name: "pd_lead_source_detail", value: "Zillow listing inquiry" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -4,
    hour: 9,
    minute: 5,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Patrick",
      lastname: "O'Donnell",
      email: "patrick.odonnell@odonnell-cpa.com",
    },
    messageText:
      "Hi, my brother Sean referred me. We're moving back to SF from NYC late this year, looking for a 3BR townhome around $1.6M. Will need to sell our Brooklyn apartment first. Where would you start?",
    plan: writebackPlan({
      reason:
        "Referral lead with concurrent sell-side need. Mark referral, side, and home-to-sell so this isn't priced as a clean buyer.",
      note:
        "Patrick — referred by brother Sean. Moving from NYC late this year, $1.6M, 3BR townhome. Has a Brooklyn condo to sell first. Frame a buy-then-sell or sell-first conversation; intro to relocation broker partner.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer_and_seller" },
        { name: "pd_primary_intent", value: "buy_search" },
        { name: "pd_urgency", value: "normal" },
        { name: "pd_initial_lead_score", value: 70 },
        { name: "pd_is_referral", value: true },
        { name: "pd_referral_source", value: "Sean O'Donnell (brother)" },
        { name: "pd_relocation", value: true },
        { name: "pd_relocation_destination", value: "San Francisco, CA" },
        { name: "pd_budget_max", value: 1600000 },
        { name: "pd_bedrooms_min", value: 3 },
        { name: "pd_property_type", value: "townhome" },
        { name: "pd_home_to_sell", value: true },
        { name: "pd_timeframe_bucket", value: "three_to_six_months" },
        { name: "pd_buy_readiness", value: "browsing" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -4,
    hour: 10,
    minute: 18,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Yuki",
      lastname: "Tanaka",
      email: "ytanaka@nimbus-bio.com",
    },
    messageText:
      "Could you remove me from your mailing list? I bought a place two years ago and don't need more listings, thanks.",
    plan: noWriteback({
      reason:
        "Unsubscribe request — operator handles via CRM unsubscribe, not via property fields. Nothing useful to write back.",
    }),
    finalState: "PENDING",
  },
  {
    dayOffset: -4,
    hour: 11,
    minute: 32,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Sophia",
      lastname: "Reyes",
      email: "sophia.reyes@kindred.health",
      phone: "+14157559922",
    },
    messageText:
      "We've outgrown our 2BR — baby #2 due in October. Need to be in a 3BR by August. Budget probably $1.3–1.5M, ideally Bernal or Glen Park. Open to selling our current condo (Bernal, bought 2020) or keeping it as a rental — what makes sense?",
    plan: writebackPlan({
      reason:
        "Upsizing family — both sides in play, hard deadline driven by life event. Captures every key field.",
      note:
        "Sophia — upsizing for baby #2 (Oct due). Wants 3BR Bernal/Glen Park, $1.3–1.5M, by August. Has a Bernal 2BR (bought 2020); deciding sell vs. rent it out. Walk through the rent-vs-sell math; pull 3BR inventory in target areas.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer_and_seller" },
        { name: "pd_primary_intent", value: "buy_search" },
        { name: "pd_urgency", value: "high" },
        { name: "pd_initial_lead_score", value: 84 },
        { name: "pd_buy_readiness", value: "wants_showing" },
        { name: "pd_bedrooms_min", value: 3 },
        { name: "pd_budget_min", value: 1300000 },
        { name: "pd_budget_max", value: 1500000 },
        { name: "pd_desired_area", value: "Bernal Heights or Glen Park" },
        { name: "pd_timeframe_bucket", value: "one_to_three_months" },
        { name: "pd_timeline", value: "In a 3BR by August; baby due October" },
        { name: "pd_home_to_sell", value: true },
        { name: "pd_seller_motivation", value: "upsizing" },
        { name: "pd_sale_readiness", value: "considering_sale" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -4,
    hour: 12,
    minute: 56,
    trigger: "contact.created",
    contact: {
      firstname: "Daniel",
      lastname: "Park",
      email: "dpark@notebookbuilders.com",
    },
    plan: writebackPlan({
      reason: "New contact, no inbound message — baseline initial score.",
      note: "Contact created via web form; awaiting message.",
      fieldUpdates: [
        { name: "pd_initial_lead_score", value: 30 },
        { name: "pd_primary_intent", value: "unknown" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -4,
    hour: 13,
    minute: 41,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Theresa",
      lastname: "Nguyen",
      email: "theresa@nguyenarchitects.io",
      phone: "+14159991122",
    },
    messageText:
      "Pulling permits on a small mixed-use development at 21st & Folsom — looking for a broker on a future ground-up condo project (12–14 units). Open to chat in a few weeks once entitlements are locked.",
    plan: writebackPlan({
      reason:
        "Developer/sponsor outreach — long-horizon but high-value. Capture investor side, primary intent, and a note for the team's commercial partner.",
      note:
        "Theresa — developer, 12–14 unit ground-up condo project at 21st & Folsom. Long-horizon (entitlements first). Loop in commercial partner; schedule a follow-up in ~4 weeks.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "investor" },
        { name: "pd_primary_intent", value: "agent_contact_request" },
        { name: "pd_urgency", value: "low" },
        { name: "pd_initial_lead_score", value: 65 },
        { name: "pd_property_type", value: "commercial" },
        { name: "pd_property_address", value: "21st & Folsom, San Francisco, CA" },
        { name: "pd_timeframe_bucket", value: "six_plus_months" },
        { name: "pd_occupancy_intent", value: "investment_property" },
      ],
    }),
    finalState: "PENDING",
  },
  {
    dayOffset: -4,
    hour: 14,
    minute: 22,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Ben",
      lastname: "Karpel",
      email: "ben.karpel@gmail.com",
    },
    messageText: "What was the final sale price on 290 Belvedere again?",
    plan: noWriteback({
      reason:
        "One-off comp question on a sold listing — operator can answer inline. Nothing to enrich on the contact record.",
    }),
    finalState: "PENDING",
  },
  {
    dayOffset: -4,
    hour: 15,
    minute: 47,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Camille",
      lastname: "Dubois",
      email: "camille.dubois@parisretreat.fr",
    },
    messageText:
      "Bonjour, my family is considering buying a pied-à-terre in San Francisco. Budget $2–3M, ideally view, prefer Russian Hill or Pacific Heights. We'd visit once or twice a year. Can you send a few options and we'll plan a trip in October?",
    plan: writebackPlan({
      reason: "International second-home buyer with clear scope. Tag occupancy correctly.",
      note:
        "Camille — international pied-à-terre buyer, $2–3M with view, Russian Hill/Pac Heights. Targeting an October scouting trip. Curate 4–6 listings with skyline/bay views; offer concierge intro.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "buy_search" },
        { name: "pd_urgency", value: "normal" },
        { name: "pd_initial_lead_score", value: 70 },
        { name: "pd_buy_readiness", value: "browsing" },
        { name: "pd_budget_min", value: 2000000 },
        { name: "pd_budget_max", value: 3000000 },
        { name: "pd_desired_area", value: "Russian Hill or Pacific Heights" },
        { name: "pd_occupancy_intent", value: "vacation_home" },
        { name: "pd_timeframe_bucket", value: "three_to_six_months" },
        { name: "pd_lead_source_detail", value: "International buyer — pied-à-terre" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -4,
    hour: 17,
    minute: 9,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Wendy",
      lastname: "Karras",
      email: "wendy.karras@compass.com",
    },
    messageText:
      "Hi Lauren — Compass agent here, my client wants to write on 419 Diamond. Could we coordinate today?",
    plan: writebackPlan({
      reason:
        "Cooperating broker on an active offer-stage listing. Tag side/intent and the listing reference.",
      note:
        "Compass agent Wendy ready to write on 419 Diamond. Coordinate with listing side today. Not a direct-consumer lead.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "agent_contact_request" },
        { name: "pd_urgency", value: "critical" },
        { name: "pd_initial_lead_score", value: 35 },
        { name: "pd_has_existing_agent", value: true },
        { name: "pd_interested_listing_address", value: "419 Diamond St, San Francisco, CA" },
      ],
    }),
    finalState: "REJECTED",
    reviewNote:
      "Same reason as the Pacific Union one — cooperating-agent inquiries don't get the enrichment workflow.",
  },
  {
    dayOffset: -4,
    hour: 18,
    minute: 33,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Reza",
      lastname: "Ahmadi",
      email: "reza.ahmadi.sf@gmail.com",
      phone: "+14155544001",
    },
    messageText:
      "Hi — my parents are downsizing from their 4BR in St. Francis Wood and want a 2BR condo close to UCSF Parnassus (my mom has appointments there). Budget $1.1M, prefer ground-floor or elevator building. They'd sell the house too. Timeline: ready when the right thing comes up, probably 60–90 days.",
    plan: writebackPlan({
      reason: "Downsizing client with both sides and accessibility constraints — many fillable fields.",
      note:
        "Reza's parents — downsizing from St. Francis Wood (4BR) to a 2BR condo near UCSF Parnassus, $1.1M, elevator or ground-floor. Also selling the family home. 60–90 day window. Pull elevator-building condos near Parnassus and prep a sell-the-house consult.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer_and_seller" },
        { name: "pd_primary_intent", value: "buy_search" },
        { name: "pd_urgency", value: "normal" },
        { name: "pd_initial_lead_score", value: 80 },
        { name: "pd_buy_readiness", value: "wants_showing" },
        { name: "pd_property_type", value: "condo" },
        { name: "pd_bedrooms_min", value: 2 },
        { name: "pd_budget_max", value: 1100000 },
        { name: "pd_desired_area", value: "Inner Sunset / Parnassus" },
        { name: "pd_home_to_sell", value: true },
        { name: "pd_seller_motivation", value: "downsizing" },
        { name: "pd_sale_readiness", value: "considering_sale" },
        { name: "pd_timeframe_bucket", value: "one_to_three_months" },
        { name: "pd_occupancy_intent", value: "primary_residence" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -4,
    hour: 21,
    minute: 12,
    trigger: "conversation.message.received",
    contact: {
      firstname: null,
      lastname: null,
      email: "growth@scaleleadsforyou.io",
    },
    messageText:
      "Hi there — wanted to share how we helped Compass agents add 30 deals/year using our AI dialer. Quick demo this week?",
    plan: noWriteback({
      reason: "B2B sales pitch, not a real consumer lead.",
    }),
    finalState: "PENDING",
  },

  // Day -3 (May 11) — 8 events
  {
    dayOffset: -3,
    hour: 8,
    minute: 14,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Jordan",
      lastname: "Brennan",
      email: "jordan.brennan@gmail.com",
      phone: "+14154441890",
    },
    messageText:
      "Last week's tour at the Potrero loft was great — we'd like to put in an offer at $1.25M, 20% down, 30-day close. Can you write it up tomorrow morning?",
    plan: writebackPlan({
      reason: "Offer-ready buyer with terms. Maxes urgency and readiness.",
      note:
        "Jordan — offer on the Potrero loft: $1.25M, 20% down, 30-day close. Write it up tomorrow AM. Confirm financing letter still current.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "buy_search" },
        { name: "pd_urgency", value: "critical" },
        { name: "pd_initial_lead_score", value: 95 },
        { name: "pd_buy_readiness", value: "offer_ready" },
        { name: "pd_financing_status", value: "preapproved" },
        { name: "pd_budget_max", value: 1250000 },
        { name: "pd_timeframe_bucket", value: "immediate" },
        { name: "pd_preferred_contact_method", value: "call" },
      ],
    }),
    finalState: "AUTO_APPLIED",
  },
  {
    dayOffset: -3,
    hour: 9,
    minute: 47,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Mira",
      lastname: "Solana",
      email: "mira.solana@hellosignsf.com",
    },
    messageText:
      "Hi — we just listed our place with another agent two weeks ago and our open house was empty. Considering switching. Any thoughts on what to do differently?",
    plan: writebackPlan({
      reason:
        "Already-listed seller exploring a switch. Tag readiness state and existing-agent so the operator can run the right re-list playbook.",
      note:
        "Mira — already listed (other agent), low traffic after two weeks. Considering switching. Run the relist-diagnostic playbook (price, photos, days-on-market vs. comps); meet in person.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "seller" },
        { name: "pd_primary_intent", value: "sell_inquiry" },
        { name: "pd_urgency", value: "high" },
        { name: "pd_initial_lead_score", value: 78 },
        { name: "pd_sale_readiness", value: "already_listed" },
        { name: "pd_has_existing_agent", value: true },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -3,
    hour: 11,
    minute: 30,
    trigger: "contact.created",
    contact: {
      firstname: "Liz",
      lastname: "Markham",
      email: "liz.markham@granitewealth.co",
    },
    plan: writebackPlan({
      reason: "New contact via form, no message yet.",
      note: "Contact created from web form; no message body yet.",
      fieldUpdates: [
        { name: "pd_initial_lead_score", value: 30 },
        { name: "pd_primary_intent", value: "unknown" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -3,
    hour: 12,
    minute: 58,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Vikram",
      lastname: "Patel",
      email: "vikram.patel@northtower.io",
      phone: "+16505558877",
    },
    messageText:
      "Hi — interested in 88 King St unit 1810. Cash, can close in 14 days. Need to see it Friday or Saturday. Also want a quick HOA + assessment history before we tour.",
    plan: writebackPlan({
      reason:
        "Cash buyer with a fast close and a specific listing. Strongest possible readiness signals.",
      note:
        "Vikram — cash buyer, 14-day close on 88 King #1810. Wants tour Friday or Saturday + HOA/assessment history first. Pull HOA docs today; offer Fri 5pm or Sat 11am.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "request_showing" },
        { name: "pd_urgency", value: "critical" },
        { name: "pd_initial_lead_score", value: 93 },
        { name: "pd_buy_readiness", value: "offer_ready" },
        { name: "pd_financing_status", value: "cash" },
        { name: "pd_property_type", value: "condo" },
        { name: "pd_interested_listing_address", value: "88 King St #1810, San Francisco, CA" },
        { name: "pd_requested_tour_window", value: "Friday or Saturday" },
        { name: "pd_timeframe_bucket", value: "immediate" },
      ],
    }),
    finalState: "AUTO_APPLIED",
  },
  {
    dayOffset: -3,
    hour: 14,
    minute: 11,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Erin",
      lastname: "Fitzgerald",
      email: "erin.fitzgerald.sf@gmail.com",
    },
    messageText:
      "Hi! My fiancé and I are getting married in July and want to buy our first place together. Budget $900k–1.1M, looking at Sunset or Outer Richmond, 2BR is fine. We're saving the down payment from our wedding fund — closer to fall on the timing. What should we do first?",
    plan: writebackPlan({
      reason: "First-time pre-down-payment buyers, clear targets and timeline.",
      note:
        "Erin + fiancé — wedding July, first home by fall. $900k–1.1M, 2BR Sunset/Outer Richmond. Saving down payment from wedding fund. Send the first-time-buyer prep guide + intro a lender to firm up financing.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "buy_search" },
        { name: "pd_urgency", value: "normal" },
        { name: "pd_initial_lead_score", value: 60 },
        { name: "pd_buy_readiness", value: "browsing" },
        { name: "pd_financing_status", value: "needs_financing" },
        { name: "pd_bedrooms_min", value: 2 },
        { name: "pd_budget_min", value: 900000 },
        { name: "pd_budget_max", value: 1100000 },
        { name: "pd_desired_area", value: "Sunset or Outer Richmond" },
        { name: "pd_timeframe_bucket", value: "three_to_six_months" },
        { name: "pd_occupancy_intent", value: "primary_residence" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -3,
    hour: 15,
    minute: 44,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Owen",
      lastname: "Becker",
      email: "owen.becker@gmail.com",
    },
    messageText:
      "Tried to schedule a tour through your site and got a 500 error — wanted to look at 18 Cumberland Sunday. Help?",
    plan: writebackPlan({
      reason: "Tour request blocked by a site bug. Capture intent and listing so the operator can recover.",
      note:
        "Owen tried to book a Sunday tour at 18 Cumberland but the form errored. Book him manually; flag the site bug to engineering.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "request_showing" },
        { name: "pd_urgency", value: "high" },
        { name: "pd_initial_lead_score", value: 68 },
        { name: "pd_interested_listing_address", value: "18 Cumberland St, San Francisco, CA" },
        { name: "pd_requested_tour_window", value: "Sunday" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -3,
    hour: 17,
    minute: 22,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Hana",
      lastname: "Kobayashi",
      email: "hana.kobayashi@bart-art.org",
    },
    messageText: "no thanks",
    plan: noWriteback({
      reason: "Two-word brush-off with no context. Nothing actionable.",
    }),
    finalState: "PENDING",
  },
  {
    dayOffset: -3,
    hour: 19,
    minute: 5,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Bruno",
      lastname: "Calderon",
      email: "bruno.calderon@silverlinegroup.net",
      phone: "+14156609812",
    },
    messageText:
      "Looking to acquire a 1031 exchange target in the next 45 days. Sold a strip-mall in Sacramento; need $3.4M+ basis. Open to small multifamily or NNN retail in the Bay Area.",
    plan: writebackPlan({
      reason:
        "1031 exchange buyer with a hard timeline. Tag investor intent and the unusually tight timeframe.",
      note:
        "Bruno — 1031 exchange (Sacramento strip-mall just sold), $3.4M+ basis, 45-day window. Small multifamily or NNN retail. Loop in commercial partner and surface available exchange targets ASAP.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "investor" },
        { name: "pd_primary_intent", value: "investment_inquiry" },
        { name: "pd_urgency", value: "critical" },
        { name: "pd_initial_lead_score", value: 85 },
        { name: "pd_financing_status", value: "cash" },
        { name: "pd_budget_min", value: 3400000 },
        { name: "pd_occupancy_intent", value: "investment_property" },
        { name: "pd_timeframe_bucket", value: "within_30_days" },
        { name: "pd_buy_readiness", value: "offer_ready" },
      ],
    }),
    finalState: "AUTO_APPLIED",
  },

  // Day -2 (May 12) — 10 events
  {
    dayOffset: -2,
    hour: 7,
    minute: 38,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Nora",
      lastname: "Engström",
      email: "nora.engstrom@scandhomedesign.se",
    },
    messageText:
      "Hi — I'm moving from Stockholm in September for a role at Stripe. Need temporary furnished housing for 60 days, then to buy. Roughly $1.5M budget, 2BR, walkable neighborhood. SoMa or Mission Bay?",
    plan: writebackPlan({
      reason:
        "Combined rental-then-buy plan from a relocating exec — capture both intents and timing clearly.",
      note:
        "Nora — Stripe relocation from Stockholm in Sept. 60-day furnished rental → buy 2BR ~$1.5M in SoMa or Mission Bay. Send the Stripe relocation kit; intro to corp-housing partner.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "buy_search" },
        { name: "pd_urgency", value: "normal" },
        { name: "pd_initial_lead_score", value: 78 },
        { name: "pd_relocation", value: true },
        { name: "pd_relocation_destination", value: "San Francisco, CA" },
        { name: "pd_bedrooms_min", value: 2 },
        { name: "pd_budget_max", value: 1500000 },
        { name: "pd_desired_area", value: "SoMa or Mission Bay" },
        { name: "pd_timeframe_bucket", value: "three_to_six_months" },
        { name: "pd_buy_readiness", value: "browsing" },
        { name: "pd_lead_source_detail", value: "Stripe relocation inbound" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -2,
    hour: 9,
    minute: 11,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Greta",
      lastname: "Halloran",
      email: "greta.halloran@frontporch.bakery",
      phone: "+14156128830",
    },
    messageText:
      "Hi, I own a duplex in the Mission and one of the tenants just gave notice. Thinking about selling rather than re-leasing. What's the difference between selling occupied vs. vacant in this market?",
    plan: writebackPlan({
      reason:
        "Decision-stage seller with property specifics. Captures motivation and condition cleanly.",
      note:
        "Greta — Mission duplex, one tenant moving out. Considering sell-vacant vs. sell-occupied. Send the occupied-vs-vacant comp analysis and propose a 30-min strategy call.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "seller" },
        { name: "pd_primary_intent", value: "sell_inquiry" },
        { name: "pd_urgency", value: "normal" },
        { name: "pd_initial_lead_score", value: 70 },
        { name: "pd_sale_readiness", value: "considering_sale" },
        { name: "pd_property_type", value: "multifamily" },
        { name: "pd_desired_area", value: "Mission District, San Francisco" },
        { name: "pd_seller_motivation", value: "exploring" },
        { name: "pd_has_existing_agent", value: false },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -2,
    hour: 10,
    minute: 38,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Trent",
      lastname: "Hashimoto",
      email: "trent.h@gmail.com",
    },
    messageText: "u still showing 24 belvedere?",
    plan: writebackPlan({
      reason:
        "Terse but does specify a listing and confirms tour intent — small writeback covers the basics.",
      note: "Trent asking if 24 Belvedere is still showing. Confirm availability + book a slot.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "request_showing" },
        { name: "pd_urgency", value: "normal" },
        { name: "pd_initial_lead_score", value: 50 },
        { name: "pd_interested_listing_address", value: "24 Belvedere St, San Francisco, CA" },
        { name: "pd_buy_readiness", value: "wants_showing" },
      ],
    }),
    finalState: "PENDING",
  },
  {
    dayOffset: -2,
    hour: 12,
    minute: 19,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Janelle",
      lastname: "Okafor",
      email: "janelle.okafor@vesselai.com",
      phone: "+14159988811",
    },
    messageText:
      "I'm a single buyer, no kids, work remotely. Want a small SFH or townhome with a yard for my dogs in either Sunset, Bernal, or El Cerrito. $1.1M cap, financing through Chase, pre-approval letter attached. Flexible on neighborhood, picky about light + outdoor space.",
    plan: writebackPlan({
      reason:
        "Self-described buyer profile with explicit budget, financing, and preferences. Worth populating broadly.",
      note:
        "Janelle — solo remote buyer w/ dogs, SFH or townhome, $1.1M cap, Sunset/Bernal/El Cerrito, light + outdoor space mandatory. Pre-approved through Chase. Filter for south-facing or corner units with backyards.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "buy_search" },
        { name: "pd_urgency", value: "normal" },
        { name: "pd_initial_lead_score", value: 80 },
        { name: "pd_buy_readiness", value: "actively_touring" },
        { name: "pd_financing_status", value: "preapproved" },
        { name: "pd_budget_max", value: 1100000 },
        { name: "pd_desired_area", value: "Sunset, Bernal Heights, or El Cerrito" },
        { name: "pd_property_type", value: "single_family" },
        { name: "pd_occupancy_intent", value: "primary_residence" },
        { name: "pd_timeframe_bucket", value: "one_to_three_months" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -2,
    hour: 13,
    minute: 47,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Felix",
      lastname: "Ortega",
      email: "felix.ortega@gmail.com",
    },
    messageText: "ok",
    plan: noWriteback({
      reason: "Single-word acknowledgement in an active thread. Nothing to capture.",
    }),
    finalState: "PENDING",
  },
  {
    dayOffset: -2,
    hour: 15,
    minute: 24,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Amelia",
      lastname: "Whitfield",
      email: "amelia.whitfield@northstaracademy.org",
    },
    messageText:
      "Hi, my kids are starting at Lick-Wilmerding in the fall, currently we're in Oakland. Looking to be in the catchment for an easier commute — Forest Hill, West Portal, or Miraloma. Budget $1.7M, single-family, 3BR+, garage non-negotiable.",
    plan: writebackPlan({
      reason:
        "Family relocation with hard non-negotiables. Fill geography, budget, property, occupancy.",
      note:
        "Amelia — relocating from Oakland; kids start at Lick-Wilmerding. $1.7M, 3BR+ SFH with garage in Forest Hill / West Portal / Miraloma. Pull active listings + show two competitive recent comps.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "buy_search" },
        { name: "pd_urgency", value: "high" },
        { name: "pd_initial_lead_score", value: 82 },
        { name: "pd_buy_readiness", value: "wants_showing" },
        { name: "pd_bedrooms_min", value: 3 },
        { name: "pd_budget_max", value: 1700000 },
        { name: "pd_property_type", value: "single_family" },
        { name: "pd_desired_area", value: "Forest Hill, West Portal, or Miraloma" },
        { name: "pd_occupancy_intent", value: "primary_residence" },
        { name: "pd_timeframe_bucket", value: "one_to_three_months" },
        { name: "pd_relocation", value: true },
        { name: "pd_relocation_destination", value: "San Francisco, CA" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -2,
    hour: 16,
    minute: 39,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Theo",
      lastname: "McAllister",
      email: "theo.mcallister@gmail.com",
    },
    messageText:
      "Question — if we sell our place in Noe Valley and move to Tahoe, do you have a referral partner up there?",
    plan: writebackPlan({
      reason:
        "Out-of-area move with referral need. Capture sell-side and the relocation destination.",
      note:
        "Theo — sell-and-relocate to Tahoe. Confirm referral partner in Truckee/Tahoe; line up local seller consult on the Noe Valley property.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "seller" },
        { name: "pd_primary_intent", value: "sell_inquiry" },
        { name: "pd_urgency", value: "normal" },
        { name: "pd_initial_lead_score", value: 65 },
        { name: "pd_relocation", value: true },
        { name: "pd_relocation_destination", value: "Lake Tahoe, CA" },
        { name: "pd_sale_readiness", value: "considering_sale" },
        { name: "pd_seller_motivation", value: "relocation" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -2,
    hour: 18,
    minute: 12,
    trigger: "contact.created",
    contact: {
      firstname: "Cole",
      lastname: "Ramirez",
      email: "cole.ramirez@parchworks.io",
    },
    plan: writebackPlan({
      reason: "Contact created via web form with no message body.",
      note: "Web form contact, no message body.",
      fieldUpdates: [
        { name: "pd_initial_lead_score", value: 30 },
        { name: "pd_primary_intent", value: "unknown" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -2,
    hour: 19,
    minute: 41,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Sienna",
      lastname: "Hwang",
      email: "sienna.hwang.sf@gmail.com",
    },
    messageText:
      "We've been browsing but honestly nothing in our budget ($800k) looks great. Should we wait until rates drop, or keep looking? Curious for your take.",
    plan: writebackPlan({
      reason:
        "Wavering buyer with clear budget. Capture readiness and timeframe; soft writeback.",
      note:
        "Sienna — on the fence, $800k budget, wondering whether to wait for rates. Send the SF $800k inventory snapshot + a 'rent vs. buy now' worksheet.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "buy_search" },
        { name: "pd_urgency", value: "low" },
        { name: "pd_initial_lead_score", value: 45 },
        { name: "pd_budget_max", value: 800000 },
        { name: "pd_buy_readiness", value: "browsing" },
        { name: "pd_timeframe_bucket", value: "six_plus_months" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -2,
    hour: 21,
    minute: 28,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Rowan",
      lastname: "Beckett",
      email: "rowan.beckett@gmail.com",
    },
    messageText:
      "Hi, looking at the auction listing at 1500 Mission. What's the reserve and when does the bidding open? Need to fly in from Austin if it's serious.",
    plan: writebackPlan({
      reason: "Auction-stage inquiry on a specific listing from an out-of-state buyer.",
      note:
        "Rowan — flying in from Austin if 1500 Mission auction makes sense. Confirm reserve, opening-bid date, and required deposit; offer to walk the property next Tuesday.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "buy_search" },
        { name: "pd_urgency", value: "high" },
        { name: "pd_initial_lead_score", value: 72 },
        { name: "pd_buy_readiness", value: "actively_touring" },
        { name: "pd_interested_listing_address", value: "1500 Mission St, San Francisco, CA" },
        { name: "pd_timeframe_bucket", value: "within_30_days" },
      ],
    }),
    finalState: "APPLIED",
  },

  // Day -1 (May 13) — 9 events
  {
    dayOffset: -1,
    hour: 8,
    minute: 4,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Ravi",
      lastname: "Subramanian",
      email: "ravi.s@stripe.com",
      phone: "+14157754411",
    },
    messageText:
      "Got my pre-approval through Better, $1.6M ceiling, 25% down. Looking at 2-3BR in Cole Valley / Cole Heights, school commute to Lakeshore for our daughter. Open this weekend for tours.",
    plan: writebackPlan({
      reason: "Engaged buyer with full financing and tour-ready availability. Lots to fill.",
      note:
        "Ravi — preapproved $1.6M (Better), 25% down. 2–3BR Cole Valley/Heights, Lakeshore commute. Weekend tours. Pull Cole Valley inventory + map commute time to Lakeshore.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "request_showing" },
        { name: "pd_urgency", value: "high" },
        { name: "pd_initial_lead_score", value: 85 },
        { name: "pd_buy_readiness", value: "wants_showing" },
        { name: "pd_financing_status", value: "preapproved" },
        { name: "pd_bedrooms_min", value: 2 },
        { name: "pd_budget_max", value: 1600000 },
        { name: "pd_desired_area", value: "Cole Valley or Cole Heights" },
        { name: "pd_requested_tour_window", value: "This weekend" },
        { name: "pd_occupancy_intent", value: "primary_residence" },
        { name: "pd_timeframe_bucket", value: "one_to_three_months" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -1,
    hour: 9,
    minute: 32,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Imani",
      lastname: "Caldwell",
      email: "imani.caldwell@oaklandlibrary.org",
    },
    messageText:
      "Hello — I inherited my aunt's house in Crocker-Amazon (3BR, 1BA, original kitchen, original everything really). I'm not in a rush. What do I need to know about the process?",
    plan: writebackPlan({
      reason: "Inherited / estate-adjacent seller. Operator needs motivation and condition signals.",
      note:
        "Imani — inherited 3BR/1BA in Crocker-Amazon (original kitchen/everything). Not in a rush. Walk her through probate vs. trust, light-rehab vs as-is comps, and recommended timing.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "seller" },
        { name: "pd_primary_intent", value: "sell_inquiry" },
        { name: "pd_urgency", value: "low" },
        { name: "pd_initial_lead_score", value: 65 },
        { name: "pd_property_type", value: "single_family" },
        { name: "pd_bedrooms_min", value: 3 },
        { name: "pd_bathrooms_min", value: 1 },
        { name: "pd_sale_readiness", value: "exploring_value" },
        { name: "pd_seller_motivation", value: "estate" },
        { name: "pd_seller_property_condition", value: "needs_major_work" },
        { name: "pd_desired_area", value: "Crocker-Amazon, San Francisco" },
        { name: "pd_has_existing_agent", value: false },
        { name: "pd_timeframe_bucket", value: "six_plus_months" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -1,
    hour: 10,
    minute: 56,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Wes",
      lastname: "Garrison",
      email: "wes.garrison@gmail.com",
    },
    messageText: "Test, please ignore",
    plan: noWriteback({
      reason: "Manual test message from a contact; nothing real to capture.",
    }),
    finalState: "PENDING",
  },
  {
    dayOffset: -1,
    hour: 11,
    minute: 47,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Anu",
      lastname: "Iyer",
      email: "anu.iyer@candorhealth.com",
      phone: "+14157219009",
    },
    messageText:
      "Cancelling our tour today — daughter got sick. Reschedule for next week?",
    plan: writebackPlan({
      reason:
        "Reschedule request — small but real signal that this buyer is engaged. Capture nothing about property; tweak the timeframe slightly.",
      note: "Anu cancelling today's tour, kid sick. Reschedule mid-next-week; suggest Tue/Wed evening.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "request_showing" },
        { name: "pd_urgency", value: "normal" },
        { name: "pd_initial_lead_score", value: 55 },
        { name: "pd_requested_tour_window", value: "Next week (Tue/Wed evening)" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -1,
    hour: 13,
    minute: 22,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Manuel",
      lastname: "Soto",
      email: "manny.soto@redbrickauto.com",
      phone: "+15105557709",
    },
    messageText:
      "Wife and I are looking at the duplex on 30th Ave (Outer Richmond). We'd live in one unit, rent the other. Can you tell us if it would qualify for owner-occupier financing?",
    plan: writebackPlan({
      reason:
        "Mixed-occupancy buyer with a financing nuance and a specific listing.",
      note:
        "Manuel + wife — duplex on 30th Ave (Outer Richmond), live-in-one-rent-the-other. Confirm conforming owner-occupier financing eligibility; loop in lender partner.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "buy_search" },
        { name: "pd_urgency", value: "high" },
        { name: "pd_initial_lead_score", value: 76 },
        { name: "pd_buy_readiness", value: "actively_touring" },
        { name: "pd_property_type", value: "multifamily" },
        { name: "pd_occupancy_intent", value: "primary_residence" },
        { name: "pd_desired_area", value: "Outer Richmond, San Francisco" },
        { name: "pd_financing_status", value: "needs_financing" },
        { name: "pd_interested_listing_address", value: "30th Ave duplex, Outer Richmond, San Francisco, CA" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -1,
    hour: 14,
    minute: 51,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Devon",
      lastname: "Pritchard",
      email: "devon.pritchard@gmail.com",
    },
    messageText:
      "Hi - what's a fair brokerage fee for selling a $1.4M SFH right now? Other agents quoted 5%, 4.5%, and 4%. Trying to understand what's standard.",
    plan: writebackPlan({
      reason:
        "Seller in shopping-agents mode. Tag the side and motivation lightly; the operator's real value is the call.",
      note:
        "Devon — shopping listing agents on a $1.4M SFH. Don't quote a number in writing; pitch a 20-minute call to walk through bundled marketing, days-on-market, and net-to-seller.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "seller" },
        { name: "pd_primary_intent", value: "agent_contact_request" },
        { name: "pd_urgency", value: "high" },
        { name: "pd_initial_lead_score", value: 70 },
        { name: "pd_sale_readiness", value: "ready_to_list" },
        { name: "pd_property_type", value: "single_family" },
        { name: "pd_price_expectation", value: 1400000 },
        { name: "pd_has_existing_agent", value: false },
      ],
    }),
    finalState: "PENDING",
  },
  {
    dayOffset: -1,
    hour: 16,
    minute: 18,
    trigger: "contact.created",
    contact: {
      firstname: "Sai",
      lastname: "Krishnan",
      email: "sai.krishnan@hellodatabase.io",
    },
    plan: writebackPlan({
      reason: "New contact via web form, no message yet.",
      note: "Contact created from web form; no message body yet.",
      fieldUpdates: [
        { name: "pd_initial_lead_score", value: 30 },
        { name: "pd_primary_intent", value: "unknown" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -1,
    hour: 17,
    minute: 47,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Mara",
      lastname: "Ellis",
      email: "mara.ellis@gmail.com",
      phone: "+14154455100",
    },
    messageText:
      "Hi Lauren, my dad and I are flying in next month from Boston to look at 4 places for him to move closer to me. He's 78, mobility-limited, wants elevator or single-level, ground-floor preferred. Mid Sunset, Forest Hill, or Lake. Cash buyer, $1M cap.",
    plan: writebackPlan({
      reason:
        "Multi-criteria older-buyer move-in with cash and a tour trip planned. Lots to fill.",
      note:
        "Mara setting up for her dad — mobility-limited, elevator/single-level, $1M cash, Mid Sunset/Forest Hill/Lake. Pull elevator condos + single-level homes; pre-book 4 tours for next month's trip.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "buy_search" },
        { name: "pd_urgency", value: "high" },
        { name: "pd_initial_lead_score", value: 82 },
        { name: "pd_buy_readiness", value: "wants_showing" },
        { name: "pd_financing_status", value: "cash" },
        { name: "pd_budget_max", value: 1000000 },
        { name: "pd_desired_area", value: "Mid Sunset, Forest Hill, or Lake" },
        { name: "pd_occupancy_intent", value: "primary_residence" },
        { name: "pd_timeframe_bucket", value: "one_to_three_months" },
        { name: "pd_relocation", value: true },
        { name: "pd_relocation_destination", value: "San Francisco, CA" },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: -1,
    hour: 20,
    minute: 11,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Quincy",
      lastname: "Adler",
      email: "quincy.adler@gmail.com",
    },
    messageText:
      "Saw a flyer about your sellers' workshop. Can my partner and I come, even though we're 9-12 months out?",
    plan: writebackPlan({
      reason:
        "Top-of-funnel seller showing up to learning content. Tag side and a long timeframe.",
      note:
        "Quincy + partner — 9–12 months out from selling, want to attend the workshop. Confirm seat + send the pre-read.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "seller" },
        { name: "pd_primary_intent", value: "sell_inquiry" },
        { name: "pd_urgency", value: "low" },
        { name: "pd_initial_lead_score", value: 50 },
        { name: "pd_sale_readiness", value: "exploring_value" },
        { name: "pd_timeframe_bucket", value: "six_plus_months" },
        { name: "pd_lead_source_detail", value: "Sellers' workshop flyer signup" },
      ],
    }),
    finalState: "APPLIED",
  },

  // Day 0 (May 14, today) — 6 events (don't want to clobber the existing today rows)
  {
    dayOffset: 0,
    hour: 6,
    minute: 32,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Ben",
      lastname: "Hsu",
      email: "ben.hsu@gmail.com",
      phone: "+14155558912",
    },
    messageText:
      "Hi - my offer on 511 Sanchez was accepted last night! What do we need to do this week to keep the close on track?",
    plan: writebackPlan({
      reason:
        "Buyer in contract. Move readiness all the way and capture the listing.",
      note:
        "Ben — accepted offer on 511 Sanchez. Send escrow timeline, inspection scheduling options, and required next-week deliverables.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "buy_search" },
        { name: "pd_urgency", value: "critical" },
        { name: "pd_initial_lead_score", value: 95 },
        { name: "pd_buy_readiness", value: "offer_ready" },
        { name: "pd_interested_listing_address", value: "511 Sanchez St, San Francisco, CA" },
        { name: "pd_timeframe_bucket", value: "immediate" },
      ],
    }),
    finalState: "AUTO_APPLIED",
  },
  {
    dayOffset: 0,
    hour: 8,
    minute: 14,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Kiri",
      lastname: "Tahir",
      email: "kiri.tahir@gmail.com",
    },
    messageText:
      "Hi, we've been priced out of SF and are now looking in Daly City / South SF, 3BR townhome, $850k–950k, financing through Provident. Can we tour something this weekend?",
    plan: writebackPlan({
      reason: "Cross-city buyer with full criteria and a near-term tour ask.",
      note:
        "Kiri — repositioned south of SF (Daly City / South SF), $850k–950k, 3BR townhome, Provident pre-approval. Tour this weekend. Send 4–6 townhome candidates + propose Sat 10am/1pm tour block.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "buyer" },
        { name: "pd_primary_intent", value: "request_showing" },
        { name: "pd_urgency", value: "high" },
        { name: "pd_initial_lead_score", value: 78 },
        { name: "pd_buy_readiness", value: "wants_showing" },
        { name: "pd_financing_status", value: "preapproved" },
        { name: "pd_property_type", value: "townhome" },
        { name: "pd_bedrooms_min", value: 3 },
        { name: "pd_budget_min", value: 850000 },
        { name: "pd_budget_max", value: 950000 },
        { name: "pd_desired_area", value: "Daly City or South San Francisco" },
        { name: "pd_requested_tour_window", value: "This weekend" },
        { name: "pd_timeframe_bucket", value: "one_to_three_months" },
      ],
    }),
    finalState: "PENDING",
  },
  {
    dayOffset: 0,
    hour: 9,
    minute: 51,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Andre",
      lastname: "Beaumont",
      email: "andre.beaumont@gmail.com",
    },
    messageText: "Hey what's commission on a $2M sale?",
    plan: writebackPlan({
      reason: "Top-of-funnel seller; just side + intent to capture.",
      note: "Andre — commission shopping on a $2M sale. Don't quote a number; offer a 20-min consult.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "seller" },
        { name: "pd_primary_intent", value: "agent_contact_request" },
        { name: "pd_urgency", value: "normal" },
        { name: "pd_initial_lead_score", value: 55 },
        { name: "pd_sale_readiness", value: "exploring_value" },
        { name: "pd_price_expectation", value: 2000000 },
      ],
    }),
    finalState: "PENDING",
  },
  {
    dayOffset: 0,
    hour: 11,
    minute: 18,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Lena",
      lastname: "Ramos",
      email: "lena.ramos@stitchstudio.co",
      phone: "+14156117788",
    },
    messageText:
      "Three of our friends used you and raved — wanted to introduce myself. We're 6-9 months from selling our Inner Sunset house. Could we set up a planning call?",
    plan: writebackPlan({
      reason: "Referral seller with a planning timeline. Tag everything.",
      note:
        "Lena — referred by three past clients, 6–9 months from selling Inner Sunset house. Set up a planning call; send the pre-list timeline + cost-to-sell worksheet.",
      fieldUpdates: [
        { name: "pd_transaction_side", value: "seller" },
        { name: "pd_primary_intent", value: "sell_inquiry" },
        { name: "pd_urgency", value: "normal" },
        { name: "pd_initial_lead_score", value: 82 },
        { name: "pd_sale_readiness", value: "exploring_value" },
        { name: "pd_is_referral", value: true },
        { name: "pd_referral_source", value: "Past clients (three friends)" },
        { name: "pd_desired_area", value: "Inner Sunset, San Francisco" },
        { name: "pd_property_type", value: "single_family" },
        { name: "pd_timeframe_bucket", value: "six_plus_months" },
        { name: "pd_has_existing_agent", value: false },
      ],
    }),
    finalState: "APPLIED",
  },
  {
    dayOffset: 0,
    hour: 12,
    minute: 47,
    trigger: "conversation.message.received",
    contact: {
      firstname: "Drew",
      lastname: "Pellegrini",
      email: "drew.pellegrini@gmail.com",
    },
    messageText: "Hi, can you take me off the list please.",
    plan: noWriteback({
      reason: "Unsubscribe request — handled at the CRM level, no field writeback.",
    }),
    finalState: "PENDING",
  },
  {
    dayOffset: 0,
    hour: 13,
    minute: 28,
    trigger: "contact.created",
    contact: {
      firstname: "Naomi",
      lastname: "Lassiter",
      email: "naomi.lassiter@ferndalecreative.com",
    },
    plan: writebackPlan({
      reason: "Web form contact, no body.",
      note: "Contact created via web form; no message body.",
      fieldUpdates: [
        { name: "pd_initial_lead_score", value: 30 },
        { name: "pd_primary_intent", value: "unknown" },
      ],
    }),
    finalState: "APPLIED",
  },
];

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function writebackPlan(input: {
  reason: string;
  note: string;
  fieldUpdates: PlanFieldUpdate[];
}): WritebackPlan {
  return {
    kind: "writeback",
    reason: input.reason,
    note: input.note,
    fieldUpdates: input.fieldUpdates,
  };
}

function noWriteback(input: { reason: string }): WritebackPlan {
  return { kind: "no_writeback", reason: input.reason };
}

function dayStart(offset: number, now: Date): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildOccurredAt(event: SyntheticEvent, today: Date): Date {
  const start = dayStart(event.dayOffset, today);
  start.setHours(event.hour, event.minute, Math.floor(Math.random() * 60));
  return start;
}

function randomHex(byteLen: number): string {
  return randomBytes(byteLen).toString("hex");
}

function randomNumericId(digits: number): string {
  let out = "";
  for (let i = 0; i < digits; i++) out += Math.floor(Math.random() * 10);
  if (out[0] === "0") out = "1" + out.slice(1);
  return out;
}

function emptyContactProperties(contact: ContactProps): Record<string, unknown> {
  const props: Record<string, unknown> = {
    zip: null,
    city: contact.city ?? null,
    email: contact.email,
    phone: contact.phone ?? null,
    state: contact.state ?? null,
    address: null,
    country: null,
    lastname: contact.lastname,
    firstname: contact.firstname,
    pd_urgency: null,
    hs_timezone: null,
    mobilephone: null,
    pd_timeline: null,
    pd_budget_max: null,
    pd_budget_min: null,
    pd_relocation: null,
    pd_is_referral: null,
    pd_bedrooms_min: null,
    pd_desired_area: null,
    pd_home_to_sell: null,
    hs_latest_source: "OFFLINE",
    pd_bathrooms_min: null,
    pd_buy_readiness: null,
    pd_property_type: null,
    pd_primary_intent: null,
    pd_sale_readiness: null,
    pd_referral_source: null,
    hs_analytics_source: "OFFLINE",
    pd_financing_status: null,
    pd_last_enriched_at: null,
    pd_occupancy_intent: null,
    pd_property_address: null,
    pd_timeframe_bucket: null,
    pd_transaction_side: null,
    pd_price_expectation: null,
    pd_requested_tour_at: null,
    pd_seller_motivation: null,
    pd_has_existing_agent: null,
    pd_initial_lead_score: null,
    pd_lead_source_detail: null,
    pd_relocation_deadline: null,
    hs_latest_source_data_1: "CONVERSATIONS",
    hs_latest_source_data_2: "ConversationsEmail",
    pd_interested_listing_id: null,
    pd_requested_tour_window: null,
    pd_interested_listing_url: null,
    pd_relocation_destination: null,
    hs_analytics_source_data_1: "CONVERSATIONS",
    hs_analytics_source_data_2: "ConversationsEmail",
    pd_interested_listing_price: null,
    pd_preferred_contact_method: null,
    pd_seller_property_condition: null,
    pd_interested_listing_address: null,
  };
  return props;
}

function buildRichText(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div dir="ltr">\n${escaped.split("\n").join("<br>\n")}\n</div>`;
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

function newCuid(): string {
  // cuid-shaped: starts with 'c', 24 chars total. Sufficient for opaque PK.
  return "c" + randomBytes(12).toString("base64url").toLowerCase().replace(/[-_]/g, "0").slice(0, 23);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required (loaded from .env).");
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const today = new Date();

  const counts = new Map<number, number>();
  for (const evt of events) {
    counts.set(evt.dayOffset, (counts.get(evt.dayOffset) ?? 0) + 1);
  }
  console.log("Inserting synthetic events. Per-day counts:");
  for (const [offset, count] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  day ${offset} → ${count} events`);
  }

  let inserted = 0;
  for (const event of events) {
    const occurredAt = buildOccurredAt(event, today);
    const occurredAtMs = occurredAt.getTime();
    // Workflow takes ~5-20s to complete from received.
    const processingDelayMs = 5_000 + Math.floor(Math.random() * 15_000);
    const completedAt = new Date(occurredAtMs + processingDelayMs);
    // Auto-applied writebacks apply right when workflow completes.
    // Manual approvals happen later — minutes to hours after.
    const approvalDelayMs =
      event.finalState === "AUTO_APPLIED"
        ? 0
        : 3 * 60_000 + Math.floor(Math.random() * 60 * 60_000);
    const appliedAt = new Date(completedAt.getTime() + approvalDelayMs);

    const contactId = randomNumericId(12);
    const messageId = randomUUID();
    const threadId = randomNumericId(11);

    const dedupeKey = randomHex(32);

    const rawWebhook =
      event.trigger === "conversation.message.received"
        ? {
            eventId: Number(`${occurredAtMs}${Math.floor(Math.random() * 1000)}`),
            objectId: threadId,
            portalId: Number(PORTAL_ID),
            messageId,
            occurredAt: occurredAtMs,
            messageType: "MESSAGE",
            subscriptionId: 0,
            subscriptionType: "conversation.newMessage",
          }
        : {
            appId: 39461078,
            eventId: Number(`${occurredAtMs}${Math.floor(Math.random() * 1000)}`),
            objectId: Number(contactId),
            portalId: Number(PORTAL_ID),
            sourceId: "39459974",
            changeFlag: "CREATED",
            occurredAt: occurredAtMs,
            changeSource: "INTEGRATION",
            objectTypeId: "0-1",
            attemptNumber: 0,
            subscriptionId: 6491212,
            subscriptionType: "object.creation",
          };

    const normalizedEvent =
      event.trigger === "conversation.message.received"
        ? {
            type: "conversation.message.received",
            occurredAt: occurredAt.toISOString(),
            hubSpotObjectId: threadId,
            hubSpotPortalId: PORTAL_ID,
            hubSpotMessageId: messageId,
          }
        : {
            type: "contact.created",
            occurredAt: occurredAt.toISOString(),
            hubSpotObjectId: contactId,
            hubSpotPortalId: PORTAL_ID,
          };

    const conversationSession =
      event.trigger === "conversation.message.received" && event.messageText
        ? {
            messageLimit: 30,
            messages: [
              {
                id: randomUUID(),
                text: null,
                actorId: "S-hubspot",
                richText: null,
                threadId,
                createdAt: new Date(occurredAtMs - 90_000).toISOString(),
                direction: null,
                truncationStatus: null,
              },
              {
                id: messageId,
                text: event.messageText,
                actorId: `V-${contactId}`,
                richText: buildRichText(event.messageText),
                threadId,
                createdAt: occurredAt.toISOString(),
                direction: "INCOMING",
                truncationStatus: "NOT_TRUNCATED",
              },
            ],
          }
        : undefined;

    const enrichmentInputContext = {
      source:
        event.trigger === "conversation.message.received"
          ? "hubspot_inbound_message"
          : "hubspot_contact_created",
      contact: {
        id: contactId,
        properties: emptyContactProperties(event.contact),
      },
      occurredAt: occurredAt.toISOString(),
      hubSpotPortalId: PORTAL_ID,
      ...(event.trigger === "conversation.message.received"
        ? {
            triggeringMessageId: messageId,
            currentConversationSession: conversationSession,
          }
        : {}),
    };

    const planForStorage =
      event.plan.kind === "writeback"
        ? {
            kind: "writeback" as const,
            note: event.plan.note,
            fieldUpdates: event.plan.fieldUpdates,
          }
        : { kind: "no_writeback" as const, reason: event.plan.reason };

    const rawOutput = event.plan.kind === "writeback"
      ? {
          kind: "writeback",
          note: event.plan.note,
          reason: event.plan.reason,
          fieldUpdates: event.plan.fieldUpdates,
        }
      : {
          kind: "no_writeback",
          reason: event.plan.reason,
        };

    const outcome =
      event.plan.kind === "writeback" ? "WRITEBACK_PROPOSED" : "NO_WRITEBACK_NEEDED";

    const webhookEventId = newCuid();
    const workflowRunId = newCuid();
    const writebackId = newCuid();

    // Step 1: webhook event
    await client.query(
      `INSERT INTO hubspot_webhook_events
        (id, "dedupeKey", "rawWebhook", "normalizedEvent", "receivedAt", "processingStatus", "processedAt")
        VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, 'processed', $6)`,
      [
        webhookEventId,
        dedupeKey,
        JSON.stringify([rawWebhook]),
        JSON.stringify(normalizedEvent),
        occurredAt.toISOString(),
        completedAt.toISOString(),
      ],
    );

    // Step 2: workflow run
    await client.query(
      `INSERT INTO hubspot_workflow_runs
        (id, "hubSpotWebhookEventId", status, outcome,
         "enrichmentInputContext", "writebackPlanInput",
         "writebackPlanRawOutputs", "writebackPlanValidations",
         "writebackPlan", "completedAt", "createdAt", "updatedAt")
        VALUES ($1, $2, 'succeeded', $3::"HubSpotWorkflowRunOutcome",
                $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb,
                $8::jsonb, $9, $10, $11)`,
      [
        workflowRunId,
        webhookEventId,
        outcome === "WRITEBACK_PROPOSED" ? "writeback_proposed" : "no_writeback_needed",
        JSON.stringify(enrichmentInputContext),
        JSON.stringify({ contactId, source: enrichmentInputContext.source }),
        JSON.stringify([rawOutput]),
        JSON.stringify([{ ok: true }]),
        JSON.stringify(planForStorage),
        completedAt.toISOString(),
        occurredAt.toISOString(),
        completedAt.toISOString(),
      ],
    );

    // Step 3: writeback (only when proposed)
    if (event.plan.kind === "writeback") {
      const applicationMetadata =
        event.finalState === "APPLIED" || event.finalState === "AUTO_APPLIED"
          ? {
              note: { id: randomNumericId(12) },
              fieldUpdates: event.plan.fieldUpdates.map((u) => ({
                name: u.name,
                result: "applied",
                previousValue: null,
                proposedValue: u.value,
              })),
            }
          : null;

      await client.query(
        `INSERT INTO hubspot_writebacks
          (id, "hubSpotWorkflowRunId", plan, state,
           "reviewDeskFeedbackNote", "appliedAt", "applicationMetadata", "createdAt")
          VALUES ($1, $2, $3::jsonb, $4::"HubSpotWritebackState",
                  $5, $6, $7::jsonb, $8)`,
        [
          writebackId,
          workflowRunId,
          JSON.stringify(planForStorage),
          event.finalState.toLowerCase(),
          event.reviewNote ?? null,
          event.finalState === "APPLIED" || event.finalState === "AUTO_APPLIED"
            ? appliedAt.toISOString()
            : null,
          applicationMetadata === null ? null : JSON.stringify(applicationMetadata),
          completedAt.toISOString(),
        ],
      );
    }

    inserted++;
  }

  await client.end();
  console.log(`\n✓ Inserted ${inserted} synthetic webhook events (+ workflow runs + writebacks where proposed).`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
