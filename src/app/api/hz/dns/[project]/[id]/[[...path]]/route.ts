import { gateway } from "@/lib/gateway"

/** The gateway for DNS zones: {project} is the Hetzner project, {id} the zone. */
const handle = gateway("dns")

export const GET = handle
export const POST = handle
export const PUT = handle
export const DELETE = handle
