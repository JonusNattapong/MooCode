import { AnthropicProvider } from "./anthropicProvider.js";
import { KiloProvider } from "./kiloProvider.js";
import type { Provider } from "./provider.js";

export type {
  AskWithToolsResult,
  ChatMessage,
  Provider,
  StreamChunkType,
} from "./provider.js";

const providers: Record<string, () => Provider> = {
  kilo: () => new KiloProvider(),
  anthropic: () => new AnthropicProvider(),
};

export const providerNames = Object.keys(providers);

export function resolveProvider(name: string): Provider {
  const factory = providers[name];
  if (!factory) {
    throw new Error(
      `Unknown provider: ${name}. Available: ${providerNames.join(", ")}`,
    );
  }
  return factory();
}

export function resolveDefaultProvider(preferredName?: string): Provider {
  if (preferredName) {
    return resolveProvider(preferredName);
  }

  for (const name of providerNames) {
    const provider = resolveProvider(name);
    if (provider.isConfigured()) {
      return provider;
    }
  }

  return resolveProvider("kilo");
}
