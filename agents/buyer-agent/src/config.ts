import { flattenError, z } from "zod";

const required = (name: string) => z.string().min(1, `${name} is missing`);

export const agentEnvSchema = z.object({
  NEXT_PUBLIC_MOCK: required("NEXT_PUBLIC_MOCK"),
  NEXT_PUBLIC_BACKEND_URL: required("NEXT_PUBLIC_BACKEND_URL"),
  PORT: required("PORT"),
  DB_PATH: required("DB_PATH"),
  APP_URL: required("APP_URL"),
});

export type AgentConfig = z.infer<typeof agentEnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const result = agentEnvSchema.safeParse({
    NEXT_PUBLIC_MOCK: env.NEXT_PUBLIC_MOCK,
    NEXT_PUBLIC_BACKEND_URL: env.NEXT_PUBLIC_BACKEND_URL,
    PORT: env.PORT,
    DB_PATH: env.DB_PATH,
    APP_URL: env.APP_URL,
  });

  if (!result.success) {
    const lines = Object.entries(flattenError(result.error).fieldErrors).map(([name, messages]) => {
      return `${name}: ${messages?.join(", ") || `${name} is missing`}`;
    });
    throw new Error(`Missing environment variables:\n${lines.join("\n")}`);
  }

  return result.data;
}
