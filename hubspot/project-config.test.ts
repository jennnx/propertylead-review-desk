import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

const projectRoot = path.join(process.cwd(), "hubspot");

async function readProjectJson(relativePath: string) {
  const file = await readFile(path.join(projectRoot, relativePath), "utf8");
  return JSON.parse(file) as unknown;
}

describe("HubSpot developer project configuration", () => {
  test("commits a static-auth HubSpot Integration with lead and message event subscriptions", async () => {
    const project = await readProjectJson("hsproject.json");
    const app = await readProjectJson("src/app/app-hsmeta.json");
    const webhooks = await readProjectJson(
      "src/app/webhooks/webhooks-hsmeta.json",
    );

    expect(project).toMatchObject({
      name: "propertylead-review-desk-hubspot",
      srcDir: "src",
      platformVersion: "2026.03",
    });

    expect(app).toMatchObject({
      uid: "propertylead_review_desk",
      type: "app",
      config: {
        name: "PropertyLead Review Desk",
        distribution: "private",
        auth: {
          type: "static",
          requiredScopes: ["crm.objects.contacts.read", "conversations.read"],
        },
      },
    });
    expect(app).not.toHaveProperty("config.auth.redirectUrls");

    expect(webhooks).toMatchObject({
      uid: "propertylead_review_desk_webhooks",
      type: "webhooks",
      config: {
        settings: {
          targetUrl:
            "https://app-base-url.example.com/api/hubspot/webhook",
          maxConcurrentRequests: 10,
        },
        subscriptions: {
          crmObjects: [
            {
              subscriptionType: "object.creation",
              objectType: "contact",
              active: true,
            },
          ],
          legacyCrmObjects: [],
          hubEvents: [
            {
              subscriptionType: "conversation.newMessage",
              active: true,
            },
          ],
        },
      },
    });
  });
});
