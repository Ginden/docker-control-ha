import { Config, envSchema } from './config-schema.mjs';

async function getConfig(): Promise<Config> {
  if (process.env.CUSTOM_CONFIG_PATH) {
    const imported = await import(process.env.CUSTOM_CONFIG_PATH);
    if (imported.default) {
      if (typeof imported.default === 'function') {
        return envSchema.parse(await imported.default());
      }
      return envSchema.parse(imported.default);
    } else {
      return envSchema.parse(imported);
    }
  }

  return envSchema.parse(process.env);
}

export const config = await getConfig();
