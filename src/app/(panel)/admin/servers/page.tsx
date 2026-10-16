import type { Metadata } from "next"
import { requireAdmin } from "@/lib/auth"
import { publicSettings } from "@/lib/settings"
import { AdminServers } from "@/components/admin/servers"

export const metadata: Metadata = { title: "Servers" }

export default async function AdminServersPage() {
  await requireAdmin()
  const settings = publicSettings()
  return <AdminServers configured={settings.hetzner.configured || settings.robot.configured} />
}
