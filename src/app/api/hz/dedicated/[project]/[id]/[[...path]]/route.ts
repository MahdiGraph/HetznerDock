import { gateway } from "@/lib/gateway"

/** The gateway for dedicated servers: {project} is the Robot account, {id} the server number. */
const handle = gateway("dedicated")

export const GET = handle
export const POST = handle
export const PUT = handle
export const DELETE = handle
