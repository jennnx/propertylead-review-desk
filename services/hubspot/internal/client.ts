import { env } from "@/lib/env";

type HubSpotFetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

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

export type HubSpotConversationThread = {
  id: string;
  associatedContactId: string | null;
};

export type ListHubSpotConversationThreadsInput = {
  associatedContactId: string;
};

export type HubSpotConversationThreadList = {
  results: HubSpotConversationThread[];
};

type HubSpotConversationThreadPage = {
  results: HubSpotConversationThread[];
  paging?: {
    next?: {
      after?: string;
    };
  };
};

type HubSpotConversationThreadMessagesPage = {
  results: unknown[];
  paging?: {
    next?: {
      after?: string;
    };
  };
};

const HUBSPOT_CONVERSATION_THREADS_PAGE_SIZE = 100;
const HUBSPOT_CONVERSATION_THREAD_MESSAGES_PAGE_SIZE = 100;
const HUBSPOT_CONVERSATION_THREAD_MESSAGES_DEFAULT_LIMIT = 30;

export type HubSpotContactProperty = {
  name: string;
  label?: string;
  type: string;
  fieldType: string;
  options?: { label?: string; value: string }[];
};

export type HubSpotClient = {
  getContact: (
    contactId: string,
    input: GetHubSpotContactInput,
  ) => Promise<HubSpotContact>;
  getConversationThread: (
    threadId: string,
  ) => Promise<HubSpotConversationThread>;
  listConversationThreads: (
    input: ListHubSpotConversationThreadsInput,
  ) => Promise<HubSpotConversationThreadList>;
  getConversationThreadMessages: (
    threadId: string,
    input?: GetHubSpotConversationThreadMessagesInput,
  ) => Promise<HubSpotConversationThreadMessages>;
  getContactProperty: (name: string) => Promise<HubSpotContactProperty | null>;
};

const HUBSPOT_BASE_URL = "https://api.hubapi.com";

function createHubSpotClient(): HubSpotClient {
  const authHeaders = (): Record<string, string> => ({
    authorization: `Bearer ${env.HUBSPOT_ACCESS_TOKEN}`,
    accept: "application/json",
  });

  const request = async <T>(
    path: string,
    input: {
      method?: string;
      searchParams?: URLSearchParams;
    } = {},
  ): Promise<T> => {
    const init: HubSpotFetchInit = {
      headers: authHeaders(),
    };

    if (input.method) init.method = input.method;

    const response = await globalThis.fetch(
      `${HUBSPOT_BASE_URL}${path}${formatSearchParams(input.searchParams)}`,
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
    async getConversationThread(threadId) {
      return request<HubSpotConversationThread>(
        `/conversations/v3/conversations/threads/${encodeURIComponent(threadId)}`,
      );
    },
    async listConversationThreads(input) {
      const results: HubSpotConversationThread[] = [];
      let after: string | undefined;

      do {
        const searchParams = new URLSearchParams({
          associatedContactId: input.associatedContactId,
          limit: String(HUBSPOT_CONVERSATION_THREADS_PAGE_SIZE),
        });
        if (after) searchParams.set("after", after);

        const page = await request<HubSpotConversationThreadPage>(
          `/conversations/v3/conversations/threads`,
          { searchParams },
        );

        results.push(...page.results);
        after = page.paging?.next?.after;
      } while (after);

      return { results };
    },
    async getConversationThreadMessages(threadId, input = {}) {
      const targetLimit =
        input.limit ?? HUBSPOT_CONVERSATION_THREAD_MESSAGES_DEFAULT_LIMIT;
      if (targetLimit <= 0) return { results: [] };
      let buffer: unknown[] = [];
      let after: string | undefined;

      do {
        const searchParams = new URLSearchParams({
          limit: String(HUBSPOT_CONVERSATION_THREAD_MESSAGES_PAGE_SIZE),
        });
        if (after) searchParams.set("after", after);

        const page = await request<HubSpotConversationThreadMessagesPage>(
          `/conversations/v3/conversations/threads/${encodeURIComponent(
            threadId,
          )}/messages`,
          { searchParams },
        );

        buffer.push(...page.results);
        if (buffer.length > targetLimit) {
          buffer = buffer.slice(-targetLimit);
        }
        after = page.paging?.next?.after;
      } while (after);

      return { results: buffer };
    },
    async getContactProperty(name) {
      const response = await globalThis.fetch(
        `${HUBSPOT_BASE_URL}/crm/v3/properties/contacts/${encodeURIComponent(name)}`,
        { headers: authHeaders() },
      );

      if (response.status === 404) return null;

      return parseHubSpotJsonResponse<HubSpotContactProperty>(response);
    },
  };
}

function formatSearchParams(searchParams: URLSearchParams | undefined): string {
  if (!searchParams) return "";
  return `?${searchParams.toString()}`;
}

async function parseHubSpotJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await readResponseBodyForError(response);
    throw new Error(
      `HubSpot request failed with status ${response.status}${body ? `: ${body}` : ""}`,
    );
  }

  return response.json() as Promise<T>;
}

async function readResponseBodyForError(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "";
  }
}

export const hubSpot = createHubSpotClient();
