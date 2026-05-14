// Simulate a HubSpot `conversation.newMessage` webhook against the local app.
//
// Used by `pnpm hubspot:simulate-inbound-message`. Discovers a real
// conversation thread + INCOMING message in the connected HubSpot portal,
// builds the webhook payload the app expects, signs it with
// HUBSPOT_CLIENT_SECRET against APP_BASE_URL (because that is what the
// receipt verifier reconstructs), and POSTs it to the running Next dev
// server. The webhook receipt path then enqueues a worker job, which
// fetches the same thread back from HubSpot for end-to-end processing.
//
// Provide --thread / --message to target a specific event, otherwise the
// newest thread + its latest INCOMING MESSAGE is used.

import { parseArgs } from "node:util";

import { config as loadDotenv } from "dotenv";

import { createHmacSignature } from "../lib/hmac-signature";

loadDotenv({ quiet: true });

const HUBSPOT_BASE_URL = "https://api.hubapi.com";
const DEFAULT_TARGET = "http://localhost:3000/api/hubspot/webhook";

type ThreadSummary = {
  id: string;
  associatedContactId: string | null;
  latestMessageTimestamp: string | null;
};

type MessageSummary = {
  id: string;
  type: string;
  direction: string | null;
  createdAt: string | null;
  textPreview: string | null;
};

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      thread: { type: "string" },
      message: { type: "string" },
      portal: { type: "string" },
      target: { type: "string" },
    },
  });

  const accessToken = requireEnv("HUBSPOT_ACCESS_TOKEN");
  const clientSecret = requireEnv("HUBSPOT_CLIENT_SECRET");
  const appBaseUrl = requireEnv("APP_BASE_URL");

  const target = values.target ?? DEFAULT_TARGET;
  const signedWebhookUrl = `${appBaseUrl.replace(/\/$/, "")}/api/hubspot/webhook`;

  const portalId = values.portal ?? (await fetchPortalId(accessToken));
  const threadId = values.thread ?? (await pickNewestThreadId(accessToken));
  const messageId =
    values.message ?? (await pickLatestIncomingMessageId(accessToken, threadId));

  const occurredAtMs = Date.now();
  const event = {
    eventId: Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`),
    subscriptionId: 0,
    portalId: Number(portalId),
    occurredAt: occurredAtMs,
    subscriptionType: "conversation.newMessage" as const,
    objectId: threadId,
    messageId,
    messageType: "MESSAGE" as const,
  };

  const rawBody = JSON.stringify([event]);
  const timestamp = String(occurredAtMs);
  const signature = createHmacSignature({
    secret: clientSecret,
    source: `POST${signedWebhookUrl}${rawBody}${timestamp}`,
  });

  console.log("→ POST", target);
  console.log("  signed-as:", signedWebhookUrl);
  console.log("  thread   :", threadId);
  console.log("  message  :", messageId);
  console.log("  portal   :", portalId);

  const response = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hubspot-signature-v3": signature,
      "x-hubspot-request-timestamp": timestamp,
    },
    body: rawBody,
  });

  const responseText = await response.text();
  console.log("← HTTP", response.status, responseText || "(empty body)");

  if (!response.ok) return 1;

  console.log(
    "\nWebhook accepted. The worker will now fetch the thread back from",
    "HubSpot, run the inbound-message workflow, and persist a writeback if",
    "Claude proposes one. Tail the worker logs to follow it through.",
  );
  return 0;
}

async function fetchPortalId(accessToken: string): Promise<string> {
  const data = await hubSpotGet<{ portalId: number }>(
    accessToken,
    "/integrations/v1/me",
  );
  return String(data.portalId);
}

async function pickNewestThreadId(accessToken: string): Promise<string> {
  const data = await hubSpotGet<{ results: ThreadSummary[] }>(
    accessToken,
    "/conversations/v3/conversations/threads?limit=20",
  );
  const candidate = [...data.results]
    .filter((thread) => thread.associatedContactId !== null)
    .sort(byLatestMessageDescending)
    .at(0);
  if (!candidate) {
    throw new Error(
      "No HubSpot conversation thread with an associated contact found. " +
        "Send an inbound email to a connected channel-account first.",
    );
  }
  return candidate.id;
}

async function pickLatestIncomingMessageId(
  accessToken: string,
  threadId: string,
): Promise<string> {
  const data = await hubSpotGet<{ results: unknown[] }>(
    accessToken,
    `/conversations/v3/conversations/threads/${encodeURIComponent(
      threadId,
    )}/messages?limit=20`,
  );
  const candidate = data.results
    .map(toMessageSummary)
    .filter((msg) => msg.type === "MESSAGE" && msg.direction === "INCOMING")
    .sort(byCreatedAtDescending)
    .at(0);
  if (!candidate) {
    throw new Error(
      `Thread ${threadId} has no INCOMING MESSAGE — cannot simulate inbound.`,
    );
  }
  return candidate.id;
}

function toMessageSummary(raw: unknown): MessageSummary {
  const record = raw as Record<string, unknown>;
  return {
    id: String(record.id ?? ""),
    type: typeof record.type === "string" ? record.type : "",
    direction:
      typeof record.direction === "string" ? record.direction : null,
    createdAt:
      typeof record.createdAt === "string" ? record.createdAt : null,
    textPreview:
      typeof record.text === "string" ? record.text.slice(0, 120) : null,
  };
}

function byLatestMessageDescending(a: ThreadSummary, b: ThreadSummary): number {
  return (b.latestMessageTimestamp ?? "").localeCompare(
    a.latestMessageTimestamp ?? "",
  );
}

function byCreatedAtDescending(a: MessageSummary, b: MessageSummary): number {
  return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
}

async function hubSpotGet<T>(
  accessToken: string,
  path: string,
): Promise<T> {
  const response = await fetch(`${HUBSPOT_BASE_URL}${path}`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `HubSpot GET ${path} failed: ${response.status} ${body.slice(0, 300)}`,
    );
  }
  return response.json() as Promise<T>;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required (load it via .env)`);
  }
  return value;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
