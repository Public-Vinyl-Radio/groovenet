import type { IntegrationKeyStatus } from "@/lib/integrationKeys";

type Env = Record<string, string | undefined>;

const isSet = (value: string | undefined) => Boolean(value?.trim());

/** Whether each optional key is configured. Reports presence only, never the value. */
export function readKeyStatus(env: Env = process.env): IntegrationKeyStatus {
  return {
    openai: { configured: isSet(env.OPENAI_API_KEY) },
    youtube: { configured: isSet(env.YOUTUBE_API_KEY) },
  };
}
