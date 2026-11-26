import "server-only";
import { z } from "zod";

/**
 * Server-only environment. Validated lazily so `next build` works without secrets;
 * any route that needs a value fails loudly at request time instead.
 */
const schema = z.object({
  MONGODB_URI: z.string().startsWith("mongodb"),
  MONGODB_DB: z.string().default("turnout"),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  LLM_PROVIDER: z.enum(["google", "anthropic"]).default("google"),
  LLM_MODEL: z.string().optional(),
  ADMIN_TOKEN: z.string().min(12).optional(),
  APP_PASSCODE: z.string().min(4).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse({
    ...process.env,
    // Accept the AI Studio name as an alias for the AI SDK's expected name.
    GOOGLE_GENERATIVE_AI_API_KEY:
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY,
  });
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid or missing environment variables: ${fields}. See .env.example.`);
  }
  cached = parsed.data;
  return cached;
}
