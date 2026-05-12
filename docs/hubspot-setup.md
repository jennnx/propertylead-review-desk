# HubSpot Integration setup

Operator guide for connecting one HubSpot account to PropertyLead Review Desk
through a HubSpot developer project using static auth. This is the only
supported HubSpot setup path; the legacy private app UI flow is not used here.

## Prerequisites

- A deployed instance of this app reachable on a stable public URL. The HubSpot
  Webhook URL must be addressable from HubSpot's network, so localhost-only
  deployments need a tunnel (e.g. ngrok, Cloudflare Tunnel) before continuing.
- Access to the target HubSpot account with permission to create developer
  projects.
- The HubSpot CLI (`hs`) installed locally. The repo's committed project
  configuration lives in `hubspot/` and is uploaded with `hs project upload`.

## 1. Configure app environment

Set both values in the deployment environment (`.env`, Compose, or your
process manager). Both are validated by `lib/env.ts` on boot.

| Variable | Purpose |
| --- | --- |
| `APP_BASE_URL` | Externally addressed base URL for this deployment (production origin, tunnel origin, or local origin during direct testing). Must be an absolute `http://` or `https://` URL. |
| `HUBSPOT_CLIENT_SECRET` | HubSpot developer project client secret. Used to verify HubSpot v3 webhook signatures on every inbound request. |
| `HUBSPOT_ACCESS_TOKEN` | HubSpot static access token for the developer project's HubSpot Integration. Used at runtime to read contacts, conversation messages, and contact property metadata. The token must have at minimum: `crm.objects.contacts.read`, `crm.schemas.contacts.read`, and `conversations.read`. For one-time portal setup (see §5) the operator's session also needs `crm.schemas.contacts.write`. |

The HubSpot Webhook URL is derived by the app as:

```text
${APP_BASE_URL}/api/hubspot/webhook
```

The route path is fixed in code (`HUBSPOT_WEBHOOK_ROUTE_PATH` in
`services/hubspot-webhooks`). The app does not read proxy headers or rebuild the URL
from the incoming request — only `APP_BASE_URL` plus the fixed path is used,
because HubSpot signs the URL it called and the app must verify against the
exact same string.

## 2. Upload the HubSpot developer project

The committed configuration in `hubspot/` defines:

- `hubspot/src/app/app-hsmeta.json` — app metadata with static auth.
- `hubspot/src/app/webhooks/webhooks-hsmeta.json` — webhook target URL and
  active subscription configuration for contact creation and new conversation
  messages.

Before uploading, replace the placeholder webhook `targetUrl` in
`webhooks-hsmeta.json` with the HubSpot Webhook URL derived from your
`APP_BASE_URL`. For example, if `APP_BASE_URL=https://review.example.com`,
the `targetUrl` becomes:

```text
https://review.example.com/api/hubspot/webhook
```

Then upload the project from the repo root:

```bash
cd hubspot
hs project upload
```

Set the resulting app's client secret as `HUBSPOT_CLIENT_SECRET` in the app
environment and redeploy so the new value is loaded.

## 3. Match the HubSpot webhook target URL exactly

HubSpot includes the request URL in the v3 signature it sends with every
HubSpot Webhook Batch. The app recomputes that signature against the URL it
derives from `APP_BASE_URL` plus the fixed route path. If the configured
HubSpot target URL differs from the app-derived HubSpot Webhook URL in any
way — scheme, host, port, trailing slash, casing — signature verification
fails and HubSpot Webhook Batches are rejected as unauthenticated.

When diagnosing signature failures, confirm the two URLs match byte for byte:

- The app-derived HubSpot Webhook URL: `${APP_BASE_URL}/api/hubspot/webhook`.
- The HubSpot target URL configured in `webhooks-hsmeta.json` and uploaded to
  the HubSpot developer project.

If `APP_BASE_URL` changes (new domain, new tunnel, environment promotion),
update the HubSpot webhook target URL to match before redeploying.

## 4. Event subscriptions

The committed `subscriptions` in `webhooks-hsmeta.json` listen for the
HubSpot Webhook Events this app currently records as worker-ready ingestion
state:

- `object.creation` for the `contact` CRM object.
- `conversation.newMessage` for conversation thread messages.

The app records only contact creation events and conversation new message
events whose `messageType` is `MESSAGE`. Other authenticated HubSpot Webhook
Events in a HubSpot Webhook Batch are acknowledged but not stored.

## 5. Writable HubSpot Property Catalog

The app reasons over a fixed catalog of HubSpot contact properties (the
Writable HubSpot Property Catalog) that Claude may target in HubSpot Writeback
Plans. The catalog is the static source of truth in
`services/hubspot/internal/catalog.ts` and is fully specified by
[ADR 0011](./adr/0011-first-writable-hubspot-property-catalog.md).

Two ownership categories exist in that file:

- `setup: "create"` — PropertyDesk-owned `pd_*` properties. The operator must
  create them in the HubSpot portal during setup. They live in the
  `propertydesk_enrichment` HubSpot property group (`PropertyDesk Enrichment`).
- `setup: "verify"` — standard HubSpot contact properties (e.g. `email`,
  `firstname`, `hs_timezone`). These already exist in any HubSpot portal; the
  app only checks they are present and compatible.

The app does not create properties or property groups at startup. It only
verifies them. On boot, `verifyWritableHubSpotPropertyCatalog` (in
`services/hubspot`) reads each catalog entry from HubSpot and reports any
missing or schema-incompatible properties as failures. A misconfigured portal
must be fixed before the app can do enrichment work — `pd_*` properties cannot
be invented at runtime.

### Setup instructions (for the coding agent)

Property creation is a one-time operator task per HubSpot portal. There is no
automated setup script. The intended workflow is for the operator to say
something like "Claude, run HubSpot property catalog setup" and for the coding
agent to drive the rest of the session: reading the catalog, calling HubSpot,
reporting decisions, and asking the operator for confirmation only at
meaningful steps.

The rest of this section is written for that coding agent (e.g. Claude Code).
When you are asked to run HubSpot property catalog setup, lead the operator
through this workflow yourself — do not hand the checklist back to them.

**1. Confirm the prerequisites.**

- Confirm with the operator that `HUBSPOT_ACCESS_TOKEN` is set in your shell
  and points at the intended HubSpot portal. If it is not set, ask for it
  before proceeding.
- The token must include `crm.schemas.contacts.write` for setup, in addition
  to the runtime scopes listed in §1 of this document. If `POST` calls below
  return 403, that is the likely cause — surface it to the operator and ask
  them to regenerate the token with the right scopes.

**2. Read the catalog.**

Read these files yourself before making any HubSpot calls:

- `services/hubspot/internal/catalog.ts` — the catalog entries and their
  expected `type`, `fieldType`, and (for enumerations) `options`.
- `docs/adr/0011-first-writable-hubspot-property-catalog.md` — the product
  decisions behind each entry. Defer to the catalog file when they disagree.
- The "Writable HubSpot Property Catalog" overview above this section — for
  the property group name and ownership rules.

**3. Ensure the property group exists.**

`GET https://api.hubapi.com/crm/v3/properties/contacts/groups/propertydesk_enrichment`.
If it returns 404, propose the create call to the operator, then on
confirmation:

```
POST https://api.hubapi.com/crm/v3/properties/contacts/groups
Authorization: Bearer $HUBSPOT_ACCESS_TOKEN
Content-Type: application/json

{ "name": "propertydesk_enrichment", "label": "PropertyDesk Enrichment", "displayOrder": -1 }
```

**4. Ensure each `setup: "create"` catalog entry exists.**

For every entry in the catalog with `setup: "create"`:

- `GET https://api.hubapi.com/crm/v3/properties/contacts/{name}`.
- On 404, propose the create call to the operator, then on confirmation:

  ```
  POST https://api.hubapi.com/crm/v3/properties/contacts
  Authorization: Bearer $HUBSPOT_ACCESS_TOKEN
  Content-Type: application/json

  {
    "name": "<catalog name>",
    "label": "<catalog label>",
    "groupName": "propertydesk_enrichment",
    "type": "<catalog type>",
    "fieldType": "<catalog fieldType>",
    "options": [{ "label": "<value>", "value": "<value>" }, ...]   // enumerations only
  }
  ```

- On 200, compare the returned `type`, `fieldType`, and (for enumerations)
  the set of option `value`s against the catalog. If they match (the portal
  may have extra option values; that is fine), move on. If they do not match,
  flag it to the operator and stop — do not attempt to "fix" an existing
  HubSpot property from code in this session.

**5. Verify each `setup: "verify"` catalog entry exists.**

For every entry with `setup: "verify"`:

- `GET https://api.hubapi.com/crm/v3/properties/contacts/{name}`.
- Confirm the response `type` and `fieldType` match the catalog. Do **not**
  POST. These are standard HubSpot properties; if one is missing or
  incompatible, raise it to the operator as a HubSpot portal configuration
  issue, not a code issue.

**6. Summarize and hand back.**

Report to the operator:

- The set of `pd_*` properties created in this session.
- The set verified as already correct.
- Any catalog entries that could not be reconciled, with the HubSpot response
  for each.

Then ask the operator to restart the app and confirm that
`verifyWritableHubSpotPropertyCatalog` reports no failures on boot. If it
does, treat each failure as another setup task to resolve in HubSpot, not as
a runtime issue to work around.

### When the catalog changes

When `services/hubspot/internal/catalog.ts` changes (a new `pd_*` entry, an
extended option list, etc.) re-run this setup workflow against every HubSpot
portal the app is connected to. The catalog file is the contract; the portal
must catch up to it before the app runs.
