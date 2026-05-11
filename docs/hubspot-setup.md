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

The HubSpot Webhook URL is derived by the app as:

```text
${APP_BASE_URL}/api/hubspot/webhook
```

The route path is fixed in code (`HUBSPOT_WEBHOOK_ROUTE_PATH` in
`services/hubspot`). The app does not read proxy headers or rebuild the URL
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
