"use client"

import * as React from "react"
import { Board, Tile } from "@/components/board"
import { ConfirmAction, ErrorNote, Loading, Notice, useAction } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { robotCall } from "@/lib/client"
import { BOOT_NAMES, type ResetType } from "@/lib/robot-types"
import { parseSshKeys } from "@/lib/ssh"
import { rescueLabel, useDedicated } from "./context"
import { Aside, ChoiceGrid, SecretDialog, type Secret } from "../parts"

type Started = { password: string | null; os: string; reset: ResetType | null; resetError: string | null }

const DETAILS: Record<string, string> = {
  linux: "A small Linux to log in to over SSH",
  vkvm: "Your installed system, with its screen in the browser",
  freebsd: "A small FreeBSD to log in to over SSH",
}

export function DedicatedRescue() {
  const { server, project, id, boot, bootError, refresh, can, openTab } = useDedicated()
  const { busy, run } = useAction()
  const [os, setOs] = React.useState<string | null>(null)
  const [sshKeys, setSshKeys] = React.useState("")
  const [restart, setRestart] = React.useState(true)
  const [secret, setSecret] = React.useState<Secret | null>(null)
  const rescue = boot?.rescue ?? null
  const active = boot?.active === "rescue"
  const options = rescue?.os ?? []
  const chosen = os ?? (options.includes("linux") ? "linux" : (options[0] ?? null))
  const keyCheck = parseSshKeys(sshKeys)
  const keyError = keyCheck.invalid.length ? `This line is not an SSH public key: ${keyCheck.invalid[0]}` : null
  const ip = server.ipv4 ?? server.ipv6?.split("/")[0] ?? "the server's IP"
  const blocked = boot?.active && boot.active !== "rescue" ? boot.active : null

  async function enable() {
    if (!chosen) return
    const res = await robotCall<Started>(project, id, "POST", "rescue", {
      os: chosen,
      sshKeys: sshKeys.trim() || undefined,
      reboot: restart,
    })
    setSshKeys("")
    refresh()
    const when = res.reset
      ? "The server restarts into it now."
      : res.resetError
        ? `Robot could not reset the server: ${res.resetError} Reset it from the State tile.`
        : "The server starts it the next time it boots; reset it from the State tile when you are ready."
    setSecret({
      title: "Rescue mode is on",
      password: res.password,
      description:
        res.os === "vkvm" ? (
          <>
            {when} Once it is up, open <code className="bg-muted px-1">https://{ip}:47773</code> in your browser and sign in with
            this password to see the screen of your installed system.
          </>
        ) : (
          <>
            {when} Log in with <code className="bg-muted px-1">ssh root@{ip}</code>
            {keyCheck.keys.length ? " using your key or this password." : " and this password."} Robot uses the rescue system for
            one start only.
          </>
        ),
    })
  }

  return (
    <Board>
      <Tile className="col-span-12 lg:col-span-8 lg:p-8">
        <h2 className="display text-3xl">Rescue system</h2>
        <p className="prose-serif mt-2 max-w-2xl text-base text-muted-foreground">
          Boots a small system from the network so you can repair the installed one: check the disks, fix a broken
          configuration, copy data off. The disks are not touched.
        </p>
        <ErrorNote error={bootError} className="mt-4" />
        {!boot && !bootError ? (
          <Loading label="Asking Robot about the rescue system…" />
        ) : boot && !rescue ? (
          <Notice className="mt-6">Robot has no rescue system for this server.</Notice>
        ) : rescue ? (
          <>
            {active ? (
              <Notice className="mt-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    The {rescueLabel(rescue.activeOs ?? "linux")} is set for the next start. Reset the server from the State tile to
                    boot it.
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!!busy}
                    onClick={() =>
                      run(
                        "disable",
                        async () => {
                          await robotCall(project, id, "DELETE", "rescue")
                          refresh()
                        },
                        "Rescue mode is off"
                      )
                    }
                  >
                    {busy === "disable" ? <Spinner /> : null} Turn it off
                  </Button>
                </div>
              </Notice>
            ) : null}
            <FieldGroup className="mt-6 max-w-2xl">
              {blocked ? (
                <Notice>
                  {BOOT_NAMES[blocked].charAt(0).toUpperCase() + BOOT_NAMES[blocked].slice(1)} is set for the next boot, and Robot
                  takes one at a time.{" "}
                  {blocked === "linux" && can("rebuild") ? (
                    <button type="button" className="underline" onClick={() => openTab("install")}>
                      Cancel it first
                    </button>
                  ) : (
                    "Ask your admin to cancel it first."
                  )}
                </Notice>
              ) : null}
              {active ? null : options.length > 1 ? (
                <ChoiceGrid
                  label="Rescue systems"
                  options={options.map((o) => ({ value: o, label: rescueLabel(o), detail: DETAILS[o] }))}
                  value={chosen}
                  onChange={setOs}
                  className="xl:grid-cols-2"
                />
              ) : null}
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
                <FieldLabel htmlFor="rescue-restart">Reset the server into it right away</FieldLabel>
              </Field>
              <div>
                <ConfirmAction
                  title={restart ? "Reset into the rescue system?" : "Turn rescue mode on?"}
                  description={
                    restart
                      ? "The server is reset at once and boots the rescue system. Anything running on it stops."
                      : "Nothing happens until the server starts again. Reset it yourself when you are ready."
                  }
                  confirmLabel={restart ? "Reset into rescue" : "Turn rescue mode on"}
                  onConfirm={enable}
                >
                  <Button size="lg" disabled={!chosen || !!keyError || !!blocked}>
                    {active ? "Start rescue again" : "Start rescue mode"}
                  </Button>
                </ConfirmAction>
                {active ? <p className="mt-2 text-sm text-muted-foreground">Starting it again gives a new password.</p> : null}
              </div>
            </FieldGroup>
          </>
        ) : null}
      </Tile>
      <Aside title="Getting back">
        <p>Robot uses the rescue system for one start. The next reset boots the server from its disks again.</p>
        <p>
          Disks show up as /dev/sda and /dev/sdb or, for NVMe, /dev/nvme0n1 and /dev/nvme1n1, and software RAID as /dev/md0 and
          /dev/md1.
        </p>
        <p>The rescue system brings installimage, Hetzner&apos;s installer, to set up a system your own way.</p>
        <p>Its SSH host key differs from the installed system&apos;s, so your SSH client may warn about it once.</p>
      </Aside>
      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
    </Board>
  )
}
