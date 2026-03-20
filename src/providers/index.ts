import type { Provider } from "./provider.js";
import { KiloProvider } from "./kiloProvider.js";
import { AnthropicProvider } from "./anthropicProvider.js";

export type { Provider } from "./provider.js";

const providers: Record<string, () => Provider> = {
  kilo: () => new KiloProvider(),
  anthropic: () => new AnthropicProvider()
};

export const providerNames = Object.keys(providers);

export function resolveProvider(name: string): Provider {
  const factory = providers[name];
  if (!factory) {
    throw new Error(`Unknown provider: ${name}. Available: ${providerNames.join(", ")}`);
  }
  const provider = factory();
  if (!provider.isConfigured()) {
    throw new Error(`Provider "${name}" is not configured`);
  }
  return provider;
}
