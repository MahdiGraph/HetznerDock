"use client"

import * as React from "react"
import { Board, Tile } from "@/components/board"
import { ConfirmAction, ErrorNote, Loading, Notice } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useHz } from "@/hooks/use-api"
import { hzCall } from "@/lib/client"
import { formatDate } from "@/lib/format"
import type { HzAction, ImageCatalog, ImageInfo } from "@/lib/hz-types"
import { parseSshKeys } from "@/lib/ssh"
import { get } from "@/lib/summary"
import { cn } from "@/lib/utils"
import { useServer } from "./context"
import { Aside, SecretDialog, type Secret } from "./parts"

type Group = "system" | "apps" | "snapshots" | "backups"

const GROUPS: { value: Group; label: string }[] = [
  { value: "system", label: "Operating systems" },
  { value: "apps", label: "Apps" },
  { value: "snapshots", label: "Snapshots" },
  { value: "backups", label: "Backups" },
]

function detailOf(image: ImageInfo, serverId: number) {
  if (image.type === "system") return image.name
  if (image.type === "app") return [image.osFlavor, image.osVersion].filter(Boolean).join(" ") || "App"
  const parts = [
    formatDate(image.created),
    image.imageSize ? `${image.imageSize.toFixed(1)} GB` : null,
    image.type === "snapshot" && image.fromServer !== serverId ? "from another server" : null,
    image.status !== "available" ? image.status : null,
  ]
  return parts.filter(Boolean).join(" · ")
}

export function ImageGrid({
  images,
  value,
  onChange,
  serverId,
}: {
  images: ImageInfo[]
  value: number | null
  onChange: (id: number) => void
  serverId: number
}) {
  return (
    <div role="radiogroup" className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
      {images.map((image) => {
        const selected = value === image.id
        const disabled = image.status !== "available"
        return (
          <button
            key={image.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={image.description}
            disabled={disabled}
            onClick={() => onChange(image.id)}
            className={cn(
              "min-w-0 px-4 py-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              selected ? "bg-primary text-primary-foreground" : "bg-tile hover:bg-accent"
            )}
          >
            <span className="block truncate text-sm font-medium">{image.description}</span>
            <span className={cn("block truncate text-[13px]", selected ? "opacity-80" : "text-muted-foreground")}>
              {detailOf(image, serverId) || " "}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function Rebuild() {
  const { server, project, id, refresh, watch, rebuildImage, isAdmin } = useServer()
  const arch = String(get(server, "server_type.architecture") ?? "x86")
  const images = useHz<ImageCatalog>(project, id, "images", { arch })
  const [picked, setGroup] = React.useState<Group | null>(null)
  // An image chosen on the Snapshots tab arrives preselected.
  const [imageId, setImageId] = React.useState<number | null>(rebuildImage)
  const [sshKeys, setSshKeys] = React.useState("")
  const [userData, setUserData] = React.useState("")
  const [understood, setUnderstood] = React.useState(false)
  const [secret, setSecret] = React.useState<Secret | null>(null)
  const protectedServer = get(server, "protection.rebuild") === true

  const all = React.useMemo(
    () => [...(images.data?.system ?? []), ...(images.data?.apps ?? []), ...(images.data?.snapshots ?? []), ...(images.data?.backups ?? [])],
    [images.data]
  )
  const chosen = all.find((i) => i.id === imageId) ?? null

  const group: Group =
    picked ?? (["snapshots", "backups"] as Group[]).find((g) => images.data?.[g].some((i) => i.id === imageId)) ?? "system"

  const keyCheck = parseSshKeys(sshKeys)
  const keyError = keyCheck.invalid.length ? `This line is not an SSH public key: ${keyCheck.invalid[0]}` : null

  async function rebuild() {
    if (!chosen) return
    const res = await hzCall<{ root_password: string | null; action?: HzAction }>(project, id, "POST", "rebuild", {
      image: chosen.id,
      ...(sshKeys.trim() && !userData.trim() ? { sshKeys } : {}),
      ...(userData.trim() ? { userData } : {}),
    })
    setUnderstood(false)
    setSshKeys("")
    setUserData("")
    refresh()
    watch(res.action, { pending: `Rebuilding with ${chosen.description}…`, success: "Rebuild finished" })
    setSecret({
      title: "Rebuild started",
      password: res.root_password,
      description: res.root_password
        ? `It takes a minute or two. Then log in as root with this password${keyCheck.keys.length ? " or your SSH key" : ""}.`
        : keyCheck.keys.length
          ? "It takes a minute or two. Then log in as root with your SSH key."
          : "It takes a minute or two. The server keeps the SSH keys it was created with; log in as root with one of them.",
    })
  }

  const list = images.data ? images.data[group] : []

  return (
    <Board>
      <Tile className="col-span-12 lg:col-span-8 lg:p-8">
        <h2 className="display text-3xl">Rebuild</h2>
        <p className="prose-serif mt-2 max-w-2xl text-base text-muted-foreground">
          Wipes the disk and installs a fresh system, an app, or one of this server&apos;s own snapshots. The IP addresses
          stay the same.
        </p>
        {protectedServer ? (
          <Notice className="mt-4">
            Rebuild protection is on for this server.{" "}
            {isAdmin ? "Turn it off on the Admin tab first." : "Ask your admin to turn it off first."}
          </Notice>
        ) : null}
        <ErrorNote error={images.error} className="mt-4" />
        {images.isLoading && !images.data ? (
          <Loading label="Loading images…" />
        ) : images.data ? (
          <FieldGroup className="mt-6">
            <div className="no-scrollbar overflow-x-auto pb-1.5">
              <Tabs value={group} onValueChange={(v) => setGroup(v as Group)}>
                <TabsList variant="line">
                  {GROUPS.map((g) => (
                    <TabsTrigger key={g.value} value={g.value} className="px-3 text-sm" disabled={!images.data![g.value].length}>
                      {g.label}
                      <span className="text-muted-foreground tabular">{images.data![g.value].length}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            {list.length ? (
              <ImageGrid images={list} value={imageId} onChange={setImageId} serverId={id} />
            ) : (
              <p className="text-sm text-muted-foreground">Nothing here.</p>
            )}
            <Field data-invalid={!!keyError || undefined}>
              <FieldLabel htmlFor="rebuild-keys">SSH public keys</FieldLabel>
              <Textarea
                id="rebuild-keys"
                value={sshKeys}
                onChange={(e) => setSshKeys(e.target.value)}
                placeholder="ssh-ed25519 AAAA… you@laptop"
                rows={3}
                disabled={!!userData.trim()}
                className={/* taste-skill-ignore: SSH keys are code */ "bg-background font-mono text-[13px]"}
              />
              {keyError ? <FieldError>{keyError}</FieldError> : null}
              <FieldDescription>Optional, one per line. They are added for root through cloud-init.</FieldDescription>
            </Field>
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Cloud-init user data</summary>
              <Field className="mt-4">
                <FieldLabel htmlFor="rebuild-userdata">User data</FieldLabel>
                <Textarea
                  id="rebuild-userdata"
                  value={userData}
                  onChange={(e) => setUserData(e.target.value)}
                  placeholder={"#cloud-config\npackages:\n  - nginx"}
                  rows={6}
                  className={/* taste-skill-ignore: cloud-init is code */ "bg-background font-mono text-[13px]"}
                />
                <FieldDescription>
                  Replaces the SSH keys above. Without it, Hetzner runs the user data the server was created with again.
                </FieldDescription>
              </Field>
            </details>
            <div>
              <ConfirmAction
                title={`Erase the disk and install ${chosen?.description ?? "this image"}?`}
                description="Everything on the server's disk is deleted. There is no undo. The server is off for a minute or two while it rebuilds."
                confirmLabel="Erase and rebuild"
                destructive
                disabled={!understood}
                extra={
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={understood} onCheckedChange={(v) => setUnderstood(!!v)} /> I understand the data on the disk is lost
                  </label>
                }
                onConfirm={rebuild}
              >
                <Button size="lg" disabled={!chosen || protectedServer || !!keyError}>
                  Rebuild
                </Button>
              </ConfirmAction>
            </div>
          </FieldGroup>
        ) : null}
      </Tile>
      <Aside title="Before you start">
        <p>Take a snapshot first if you might want the current disk back.</p>
        <p>The state turns to Rebuilding and back to Running when it is done. The new root password shows once, right after you start.</p>
        <p>Volumes stay attached and keep their data; only the system disk is replaced.</p>
      </Aside>
      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
    </Board>
  )
}
