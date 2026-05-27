import { z } from "zod";

const publicSchema = z.object({
  VITE_APP_ID: z.string(),
  VITE_BASE_URL: z.url(),
  VITE_ROOT_URL: z.url(),
  VITE_REALTIME_DOMAIN: z.string(),
  VITE_BOX_ID: z.string(),
  VITE_NODE_ENV: z.enum(["development", "production"]).default("development"),
});

const serverSchema = z.object({
  PORT: z.string(),
  API_KEY: z.string(), // provided by system variables
  DB_FILE_NAME: z.string(),
  GUEST_SERVICES_URL: z.url(),
  QUEUE_DB_FILE_NAME: z.string(),
  ERRORS_DB_FILE_NAME: z.string(),
});

const schema = serverSchema.extend(publicSchema.shape);

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore import.meta.env type issues are not correctly inferred
const metaEnv = import.meta.env;

const isServer = metaEnv?.SSR || typeof process !== "undefined";

const schemaToCheck = isServer ? schema : publicSchema;

const parsed = schemaToCheck.safeParse(isServer ? process?.env : metaEnv);

if (!parsed.success) {
  console.error("Invalid environment variables:", z.treeifyError(parsed.error));
  throw new Error("Invalid environment variables");
}

const proxy = new Proxy(parsed.data, {
  get(target, prop) {
    if (isServer || String(prop).startsWith("VITE_")) {
      return target[prop as keyof typeof target];
    }

    throw new Error(
      `Attempted to access server-side environment variable "${String(prop)}" from the client-side.`,
    );
  },
});

export const env = proxy as z.infer<typeof schema>;
