# HubSpot developer project configuration

This directory contains the committed HubSpot developer project metadata for
the single-account HubSpot Integration.

Before uploading the project to HubSpot, replace the example webhook
`targetUrl` in `src/app/webhooks/webhooks-hsmeta.json` with the app-derived
HubSpot Webhook URL:

```text
${APP_BASE_URL}/api/hubspot/webhook
```

The value to replace is:

```text
https://app-base-url.example.com/api/hubspot/webhook
```

Webhook subscription arrays remain empty unless a product workflow defines an
explicit HubSpot Webhook Event contract.
