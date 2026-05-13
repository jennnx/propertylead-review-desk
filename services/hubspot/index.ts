export {
  hubSpot,
  type GetHubSpotContactInput,
  type GetHubSpotConversationThreadMessagesInput,
  type HubSpotClient,
  type HubSpotContact,
  type HubSpotContactProperty,
  type HubSpotConversationThread,
  type HubSpotConversationThreadList,
  type HubSpotConversationThreadMessages,
  type HubSpotFetch,
  type ListHubSpotConversationThreadsInput,
} from "./internal/client";
export {
  HUBSPOT_PROPERTYDESK_PROPERTY_GROUP_LABEL,
  HUBSPOT_PROPERTYDESK_PROPERTY_GROUP_NAME,
  WRITABLE_HUBSPOT_PROPERTY_CATALOG,
  isWritableHubSpotPropertyName,
  type WritableHubSpotPropertyCatalogEntry,
  type WritableHubSpotPropertySetup,
  type WritableHubSpotPropertyType,
} from "./internal/catalog";
export {
  verifyWritableHubSpotPropertyCatalog,
  type HubSpotPropertyCatalogVerifyFailure,
  type VerifyWritableHubSpotPropertyCatalogResult,
} from "./internal/verify";
export {
  verifyWritableHubSpotPropertyCatalogOnBoot,
  type VerifyWritableHubSpotPropertyCatalogOnBootInput,
} from "./internal/boot";
