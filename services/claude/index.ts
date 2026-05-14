import {
  createInstrumentedClaude,
  runWithClaudeTelemetryContext,
  type InstrumentedClaude,
} from "./internal/wrap";

export {
  CLAUDE_MODELS,
  DEFAULT_CLAUDE_MODEL,
  type ClaudeModel,
} from "./internal/client";

export { runWithClaudeTelemetryContext };
export type { InstrumentedClaude } from "./internal/wrap";

export const claude: InstrumentedClaude = createInstrumentedClaude();
