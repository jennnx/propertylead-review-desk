import { env } from "@/lib/env";

export type HubSpotFetch = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<Response>;

export type HubSpotContact = {
  id: string;
  properties: Record<string, string | null>;
};

export type GetHubSpotContactInput = {
  properties: string[];
};

export type GetHubSpotConversationThreadMessagesInput = {
  limit?: number;
};

export type HubSpotConversationThreadMessages = {
  results: unknown[];
};

export type HubSpotContactProperty = {
  name: string;
  label?: string;
  type: string;
  fieldType: string;
  options?: { label?: string; value: string }[];
};

export type CreateHubSpotContactPropertyInput = {
  name: string;
  label: string;
  groupName: string;
  type: string;
  fieldType: string;
  options?: { label: string; value: string }[];
};

export type CreateHubSpotClientInput = {
  accessToken?: string;
  baseUrl?: string;
  fetch?: HubSpotFetch;
};

export type HubSpotClient = {
  getContact: (
    contactId: string,
    input: GetHubSpotContactInput,
  ) => Promise<HubSpotContact>;
  getConversationThreadMessages: (
    threadId: string,
    input?: GetHubSpotConversationThreadMessagesInput,
  ) => Promise<HubSpotConversationThreadMessages>;
  getContactProperty: (name: string) => Promise<HubSpotContactProperty | null>;
  createContactProperty: (
    input: CreateHubSpotContactPropertyInput,
  ) => Promise<HubSpotContactProperty>;
};

const DEFAULT_HUBSPOT_BASE_URL = "https://api.hubapi.com";

export function createHubSpotClient({
  accessToken = env.HUBSPOT_ACCESS_TOKEN,
  baseUrl = DEFAULT_HUBSPOT_BASE_URL,
  fetch: fetchHubSpot = globalThis.fetch,
}: CreateHubSpotClientInput = {}): HubSpotClient {
  const request = async <T>(
    path: string,
    input: {
      method?: string;
      body?: unknown;
      searchParams?: URLSearchParams;
    } = {},
  ): Promise<T> => {
    const init: NonNullable<Parameters<HubSpotFetch>[1]> = {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
    };

    if (input.method) init.method = input.method;
    if (input.body) {
      init.headers = {
        ...init.headers,
        "content-type": "application/json",
      };
      init.body = JSON.stringify(input.body);
    }

    const response = await fetchHubSpot(
      `${baseUrl}${path}${formatSearchParams(input.searchParams)}`,
      init,
    );

    return parseHubSpotJsonResponse<T>(response);
  };

  return {
    async getContact(contactId, input) {
      return request<HubSpotContact>(
        `/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`,
        {
          searchParams: new URLSearchParams({
            properties: input.properties.join(","),
          }),
        },
      );
    },
    async getConversationThreadMessages(threadId, input = {}) {
      return request<HubSpotConversationThreadMessages>(
        `/conversations/v3/conversations/threads/${encodeURIComponent(
          threadId,
        )}/messages`,
        {
          searchParams: new URLSearchParams({
            limit: String(input.limit ?? 30),
          }),
        },
      );
    },
    async getContactProperty(name) {
      const response = await fetchHubSpot(
        `${baseUrl}/crm/v3/properties/contacts/${encodeURIComponent(name)}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
            accept: "application/json",
          },
        },
      );

      if (response.status === 404) return null;

      return parseHubSpotJsonResponse<HubSpotContactProperty>(response);
    },
    async createContactProperty(input) {
      return request<HubSpotContactProperty>("/crm/v3/properties/contacts", {
        method: "POST",
        body: input,
      });
    },
  };
}

function formatSearchParams(searchParams: URLSearchParams | undefined): string {
  if (!searchParams) return "";
  return `?${searchParams.toString()}`;
}

async function parseHubSpotJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`HubSpot request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const hubSpot = createHubSpotClient();
