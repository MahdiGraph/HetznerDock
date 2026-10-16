import { z } from "zod"
import { PROXY_PROTOCOLS } from "./settings"
import { PERMISSION_KEYS } from "./permissions"

export const ProjectName = z.string().trim().min(1, "give it a name").max(60)
export const ApiToken = z
  .string()
  .trim()
  .min(20, "looks too short for a Hetzner API token")
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/, "a Hetzner API token has only letters and numbers")

/** A Robot webservice user, such as #ws+AbCd1234. Basic auth cannot carry a colon in it. */
export const RobotUser = z
  .string()
  .trim()
  .min(1, "enter the webservice user")
  .max(100)
  .regex(/^[^\s:]+$/, "a webservice user has no spaces or colons")
export const RobotPassword = z.string().min(1, "enter the password").max(256)

const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/

const ApiAddress = z
  .string()
  .trim()
  .url()
  .refine((u) => u.startsWith("https://") || LOOPBACK.test(u), "must start with https://")
  .transform((u) => u.replace(/\/+$/, ""))

export const HetznerInput = z.object({ baseUrl: ApiAddress })

export const RobotInput = z.object({ baseUrl: ApiAddress })

export const ProxyInput = z
  .object({
    enabled: z.boolean(),
    protocol: z.enum(PROXY_PROTOCOLS),
    host: z
      .string()
      .trim()
      .max(255)
      .regex(/^[A-Za-z0-9.:\-\[\]]*$/, "letters, numbers, dots, colons and dashes only"),
    port: z.number().int().min(1).max(65535).nullable(),
    username: z.string().max(255).default(""),
    /** undefined: keep, "": remove */
    password: z.string().max(512).optional(),
  })
  .refine((p) => !p.enabled || (p.host && p.port), {
    message: "host and port are required when the proxy is on",
    path: ["host"],
  })

export const PermissionsInput = z.object({
  ...Object.fromEntries(PERMISSION_KEYS.map((k) => [k, z.boolean()])),
  snapshots: z.number().int().min(0).max(50),
}) as unknown as z.ZodType<Record<(typeof PERMISSION_KEYS)[number], boolean> & { snapshots: number }>
