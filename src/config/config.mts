import { Config, envSchema } from './config-schema.mjs';

/**
 * Loads application configuration. Prioritizes a custom config file (via `CUSTOM_CONFIG_PATH`)
 * for dynamic/complex setups, falling back to environment variables.
 */
async function getConfig(): Promise<Config> {
  if (process.env.CUSTOM_CONFIG_PATH) {
    const imported = await import(process.env.CUSTOM_CONFIG_PATH);
    // Supports default exports (object or function) or direct module exports for config flexibility.
    if (imported.default) {
      if (typeof imported.default === 'function') {
        // Execute function for dynamic config generation.
        return envSchema.parse(await imported.default());
      }
      return envSchema.parse(imported.default);
    } else {
      return envSchema.parse(imported);
    }
  }

  // Default to parsing process environment variables.
  return envSchema.parse(process.env);
}

// Load configuration once at startup for global availability and performance.
export const config = await getConfig();
