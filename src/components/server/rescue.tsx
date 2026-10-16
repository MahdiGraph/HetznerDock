"use client"

import * as React from "react"
import { Board, Tile } from "@/components/board"
import { ConfirmAction, Notice, useAction } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { hzCall } from "@/lib/client"
import type { HzAction } from "@/lib/hz-types"
import { parseSshKeys } from "@/lib/ssh"
import { get } from "@/lib/summary"
import { useServer } from "./context"
import { openConsole } from "./power"
import { Aside, SecretDialog, type Secret } from "./parts"

function RescueSystem({ onSecret }: { onSecret: (s: Secret) => void }) {
  const { server, project, id, refresh, watch, can } = useServer()
  const { busy, run } = useAction()
  const [sshKeys, setSshKeys] = React.useState("")
  const [restart, setRestart] = React.useState(true)
  const enabled = server.rescue_enabled === true
  const ip = String(get(server, "public_net.ipv4.ip") ?? get(server, "public_net.ipv6.ip") ?? "the server's IP")
  const check = parseSshKeys(sshKeys)
  const keyError = check.invalid.length ? `This line is not an SSH public key: ${check.invalid[0]}` : null

  async function enable() {
    const res = await hzCall<{ root_password: string | null; action?: HzAction; restart?: HzAction | null }>(
      project,
      id,
      "POST",
      "rescue",
      { sshKeys: sshKeys.trim() || undefined, reboot: restart }
    )
    setSshKeys("")
    refresh()
    if (res.restart) watch(res.restart, { pending: "Restarting into rescue…", success: "The rescue system is starting" })
    else watch(res.action, { pending: "Enabling rescue mode…", success: "Rescue mode is on for the next boot" })
    onSecret({
      title: "Rescue mode is on",
      password: res.root_password,
      description: (
        <>
          {restart ? "The server restarts into the rescue system now." : "The server starts the rescue system the next time it boots."}{" "}
          Log in with <code className="bg-muted px-1">ssh root@{ip}</code>
          {check.keys.length ? " using your key or this password." : " and this password."} Hetzner turns rescue mode off
          after the first boot or after an hour without one.
        </>
      ),
    })
  }

  return (
    <Tile className="col-span-12 lg:col-span-8 lg:p-8">
      <h2 className="display text-3xl">Rescue system</h2>
      <p className="prose-serif mt-2 max-w-2xl text-base text-muted-foreground">
        Boots a small Linux system from the network so you can repair the installed one: check the disk, fix a broken
        configuration, copy data off. The disk is not touched.
      </p>
      {enabled ? (
        <Notice className="mt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>Rescue mode is on. The server starts the rescue system at its next boot.</span>
            <Button
              size="sm"
              variant="secondary"
              disabled={!!busy}
              onClick={() =>
                run("disable", async () => {
                  const res = await hzCall<{ action?: HzAction }>(project, id, "POST", "actions/disable_rescue")
                  watch(res.action, { pending: "Disabling rescue mode…", success: "Rescue mode is off" })
                  refresh()
                })
              }
            >
              {busy === "disable" ? <Spinner /> : null} Turn it off
            </Button>
          </div>
        </Notice>
      ) : null}
      <FieldGroup className="mt-6 max-w-xl">
        <Field data-invalid={!!keyError || undefined}>
          <FieldLabel htmlFor="rescue-keys">SSH public keys</FieldLabel>
          <Textarea
            id="rescue-keys"
            value={sshKeys}
            onChange={(e) => setSshKeys(e.target.value)}
            placeholder="ssh-ed25519 AAAA… you@laptop"
            rows={3}
            className={/* taste-skill-ignore: SSH keys are code */ "bg-background font-mono text-[13px]"}
          />
          {keyError ? <FieldError>{keyError}</FieldError> : null}
          <FieldDescription>Optional. Without a key, log in with the root password shown after you start.</FieldDescription>
        </Field>
        <Field orientation="horizontal">
          <Switch id="rescue-restart" checked={restart} onCheckedChange={setRestart} />
          <FieldLabel htmlFor="rescue-restart">Restart the server into it right away</FieldLabel>
        </Field>
        <div className="flex flex-wrap gap-2">
          <ConfirmAction
            title={restart ? "Restart into the rescue system?" : "Turn rescue mode on?"}
            description={
              restart
                ? "The server is reset (or powered on) at once and boots the rescue system. Anything running on it stops."
                : "Nothing happens until the server boots again. Restart it yourself when you are ready."
            }
            confirmLabel={restart ? "Restart into rescue" : "Turn rescue mode on"}
            onConfirm={enable}
          >
            <Button size="lg" disabled={!!keyError}>
              {enabled ? "Start rescue again" : "Start rescue mode"}
            </Button>
          </ConfirmAction>
          {can("console") ? (
            <Button size="lg" variant="secondary" onClick={() => openConsole(project, id)}>
              Open console
            </Button>
          ) : null}
        </div>
      </FieldGroup>
    </Tile>
  )
}

function ResetPassword({ onSecret }: { onSecret: (s: Secret) => void }) {
  const { server, project, id, watch } = useServer()
  const running = server.status === "running"

  async function reset() {
    const res = await hzCall<{ root_password: string | null; action?: HzAction }>(project, id, "POST", "actions/reset_password")
    watch(res.action, { pending: "Setting the new root password…", success: "The new root password is set" })
    onSecret({
      title: "New root password",
      password: res.root_password,
      description: "Hetzner sets it on the running system through the QEMU guest agent. It works right away once the action succeeds.",
    })
  }

  return (
    <Tile className="col-span-12 lg:col-span-8 lg:p-8">
      <h2 className="display text-3xl">Reset root password</h2>
      <p className="prose-serif mt-2 max-w-2xl text-base text-muted-foreground">
        Sets a new root password on the running system. It needs the QEMU guest agent, which Hetzner&apos;s Linux images
        have. If it fails, use the rescue system to change the password by hand.
      </p>
      <div className="mt-6">
        <ConfirmAction
          title="Set a new root password?"
          description="The current root password stops working. SSH keys keep working."
          confirmLabel="Reset password"
          onConfirm={reset}
        >
          <Button size="lg" variant="secondary" disabled={!running}>
            Reset root password
          </Button>
        </ConfirmAction>
        {!running ? <p className="mt-2 text-sm text-muted-foreground">The server has to be running.</p> : null}
      </div>
    </Tile>
  )
}

export function Rescue() {
  const { can } = useServer()
  const [secret, setSecret] = React.useState<Secret | null>(null)
  return (
    <Board>
      {can("rescue") ? <RescueSystem onSecret={setSecret} /> : null}
      <Aside title="Getting back">
        <p>The rescue system runs until the next reboot. Reboot the server from the State tile to return to the installed system.</p>
        <p>Your disk is at /dev/sda. Mount it with mount /dev/sda1 /mnt to reach your files.</p>
        <p>Hetzner shows a new SSH host key in the rescue system, so your SSH client may warn about it once.</p>
      </Aside>
      {can("password") ? <ResetPassword onSecret={setSecret} /> : null}
      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
    </Board>
  )
}
