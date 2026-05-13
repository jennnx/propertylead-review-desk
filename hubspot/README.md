# HubSpot developer project configuration

This directory contains the committed HubSpot developer project metadata for
the single-account HubSpot Integration.

Before uploading the project to HubSpot, replace the example app origin in
`src/app/app-hsmeta.json` and the example webhook `targetUrl` in
`src/app/webhooks/webhooks-hsmeta.json` with values derived from
`APP_BASE_URL`.

The permitted fetch origin is:

```text
${APP_BASE_URL}
```

The HubSpot Webhook URL is:

```text
${APP_BASE_URL}/api/hubspot/webhook
```

The committed placeholder values to replace are:

```text
https://app-base-url.example.com
https://app-base-url.example.com/api/hubspot/webhook
```

This project uses HubSpot's current developer-platform `*-hsmeta.json`
webhook component schema. For CRM object subscriptions in this file, use
`objectType`:

```json
{
  "subscriptionType": "object.creation",
  "objectType": "contact",
  "active": true
}
```

Do not change this to the older `webhooks.json`/legacy-project `objectName`
field. `hs project validate` for platform `2026.03` rejects `objectName` in
`*-hsmeta.json` webhook components.
