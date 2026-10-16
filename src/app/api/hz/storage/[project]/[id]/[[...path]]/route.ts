import { gateway } from "@/lib/gateway"

/** The gateway for Storage Boxes: {project} is the Hetzner project, {id} the Storage Box. */
const handle = gateway("storage")

export const GET = handle
export const POST = handle
export const PUT = handle
export const DELETE = handle
