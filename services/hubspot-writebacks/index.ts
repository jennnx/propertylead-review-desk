export {
  approveHubSpotWriteback,
  getHubSpotWritebackAutoMode,
  getHubSpotWritebackReview,
  listDecidedHubSpotWritebacks,
  listPendingHubSpotWritebacks,
  recordProposedHubSpotWriteback,
  rejectHubSpotWriteback,
  setHubSpotWritebackAutoMode,
  updateReviewDeskFeedbackNote,
  type ApproveHubSpotWritebackResult,
  type HubSpotWritebackAutoMode,
  type HubSpotWritebackPlanFieldUpdateView,
  type HubSpotWritebackReviewDetail,
  type HubSpotWritebackReviewItem,
  type HubSpotWritebackReviewState,
  type RecordProposedHubSpotWritebackInput,
} from "./internal/operations";

export {
  getOperatorSuggestionStateCopy,
  type OperatorSuggestionTone,
} from "./internal/operator-copy";
