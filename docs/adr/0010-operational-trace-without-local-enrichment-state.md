# 0010 — Store enrichment workflow trace, not local current lead state

**Status**: Accepted

PropertyLead Review Desk treats HubSpot as the source of truth for current contact facts, human edits, and CRM state. The app stores operational records such as HubSpot Workflow Runs, Enrichment Input Context, AI outputs, and HubSpot Writeback Plans so decisions can be audited and evaluated, but it does not maintain a parallel table of current enriched lead state. This keeps the product focused on proposing and later executing HubSpot writebacks instead of becoming a competing CRM state store.
