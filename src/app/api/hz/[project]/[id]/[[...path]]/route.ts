import { gateway } from "@/lib/gateway"

/** The gateway for cloud servers; dedicated servers have theirs under /api/hz/dedicated. */
const handle = gateway("cloud")

export const GET = handle
export const POST = handle
export const PUT = handle
export const DELETE = handle
