"use client"

import * as React from "react"
import { Board, Tile } from "@/components/board"
import { ConfirmAction, ErrorNote, Loading, Notice, useAction } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { robotCall } from "@/lib/client"
import { BOOT_NAMES, type ResetType } from "@/lib/robot-types"
import { parseSshKeys } from "@/lib/ssh"
import { useDedicated } from "./context"
import { Aside, ChoiceGrid, SecretDialog, type Secret } from "../parts"

type Started = { password: string | null; dist: string; reset: ResetType | null; resetError: string | null }

const LANGUAGES: Record<string, string> = { en: "English", de: "German" }

/** Robot reinstalls Linux through a boot configuration: installimage runs the next time the server starts. */
export function DedicatedInstall() {
  const { server, project, id, boot, bootError, refresh, can, openTab } = useDedicated()
  const { busy, run } = useAction()
  const [dist, setDist] = React.useState<string | null>(null)
  const [lang, setLang] = React.useState<string | null>(null)
  const [sshKeys, setSshKeys] = React.useState("")
  const [restart, setRestart] = React.useState(true)
  const [understood, setUnderstood] = React.useState(false)
  const [secret, setSecret] = React.useState<Secret | null>(null)
  const linux = boot?.linux ?? null
  const langs = linux?.langs ?? []
  const language = lang ?? (langs.includes("en") ? "en" : (langs[0] ?? null))
  const keyCheck = parseSshKeys(sshKeys)
  const keyError = keyCheck.invalid.length ? `This line is not an SSH public key: ${keyCheck.invalid[0]}` : null
  const ip = server.ipv4 ?? server.ipv6?.split("/")[0] ?? "the server's IP"
  const blocked = boot?.active && boot.active !== "linux" ? boot.active : null

  async function install() {
    if (!dist || !language) return
    const res = await robotCall<Started>(project, id, "POST", "linux", {
      dist,
      lang: language,
      sshKeys: sshKeys.trim() || undefined,
      reboot: restart,
    })
    setUnderstood(false)
    setSshKeys("")
    refresh()
    const login = `log in with ssh root@${ip} using ${keyCheck.keys.length ? "your SSH key or " : ""}this password`
    setSecret({
      title: res.reset ? "The installation is starting" : "The installation is set up",
      password: res.password,
      description: res.reset ? (
        <>The server was reset and installs {res.dist} now. That takes a few minutes; then {login}.</>
      ) : res.resetError ? (
        <>
          {res.dist} is set up, but Robot could not reset the server: {res.resetError} Reset it from the State tile to begin.
          When it is done, {login}.
        </>
      ) : (
        <>
          {res.dist} is installed the next time the server starts. Reset it from the State tile when you are ready; when the
          installation is done, {login}.
        </>
      ),
    })
  }

  return (
    <Board>
      <Tile className="col-span-12 lg:col-span-8 lg:p-8">
        <h2 className="display text-3xl">Install Linux</h2>
        <p className="prose-serif mt-2 max-w-2xl text-base text-muted-foreground">
          Wipes the disks and installs a fresh Linux the next time the server starts, with Hetzner&apos;s standard partitioning.
          The IP addresses stay the same.
        </p>
        <ErrorNote error={bootError} className="mt-4" />
        {!boot && !bootError ? (
          <Loading label="Asking Robot what it can install…" />
        ) : boot && !linux ? (
          <Notice className="mt-6">Robot cannot install Linux on this server.</Notice>
        ) : linux && boot?.active === "linux" ? (
          <Notice className="mt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {linux.activeDist ?? "Linux"} is set to install at the next start, erasing the disks. Reset the server from the
                State tile to begin.
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={!!busy}
                onClick={() =>
                  run(
                    "cancel",
                    async () => {
                      await robotCall(project, id, "DELETE", "linux")
                      refresh()
                    },
                    "The installation is cancelled"
                  )
                }
              >
                {busy === "cancel" ? <Spinner /> : null} Cancel it
              </Button>
            </div>
          </Notice>
        ) : linux ? (
          <FieldGroup className="mt-6">
            {blocked ? (
              <Notice>
                {BOOT_NAMES[blocked].charAt(0).toUpperCase() + BOOT_NAMES[blocked].slice(1)} is set for the next boot, and Robot
                takes one at a time.{" "}
                {blocked === "rescue" && can("rescue") ? (
                  <button type="button" className="underline" onClick={() => openTab("rescue")}>
                    Turn it off first
                  </button>
                ) : (
                  "Ask your admin to cancel it first."
                )}
              </Notice>
            ) : null}
            <ChoiceGrid label="Systems" options={linux.dists.map((d) => ({ value: d, label: d }))} value={dist} onChange={setDist} />
            {langs.length > 1 ? (
              <Field>
                <FieldLabel>Language</FieldLabel>
                <Select value={language ?? undefined} onValueChange={setLang}>
                  <SelectTrigger className="w-full bg-background sm:w-60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {langs.map((l) => (
                      <SelectItem key={l} value={l}>
                        {LANGUAGES[l] ?? l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <Field data-invalid={!!keyError || undefined}>
              <FieldLabel htmlFor="install-keys">SSH public keys</FieldLabel>
              <Textarea
                id="install-keys"
                value={sshKeys}
                onChange={(e) => setSshKeys(e.target.value)}
                placeholder="ssh-ed25519 AAAA… you@laptop"
                rows={3}
                className={/* taste-skill-ignore: SSH keys are code */ "bg-background font-mono text-[13px]"}
              />
              {keyError ? <FieldError>{keyError}</FieldError> : null}
              <FieldDescription>Optional, one per line. They are added for root on the new system.</FieldDescription>
            </Field>
            <Field orientation="horizontal">
              <Switch id="install-restart" checked={restart} onCheckedChange={setRestart} />
              <FieldLabel htmlFor="install-restart">Reset the server right away to begin</FieldLabel>
            </Field>
            <div>
              <ConfirmAction
                title={`Erase the disks and install ${dist ?? "Linux"}?`}
                description={
                  restart
                    ? "The server is reset at once and Robot installs the new system. Everything on its disks is deleted, and dedicated servers have no snapshots to go back to."
                    : "Everything on the disks is deleted the next time the server starts. Dedicated servers have no snapshots to go back to."
                }
                confirmLabel={restart ? "Erase and install now" : "Erase at the next start"}
                destructive
                disabled={!understood}
                extra={
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={understood} onCheckedChange={(v) => setUnderstood(!!v)} /> I understand the data on the disks is
                    lost
                  </label>
                }
                onConfirm={install}
              >
                <Button size="lg" disabled={!dist || !language || !!keyError || !!blocked}>
                  Install
                </Button>
              </ConfirmAction>
            </div>
          </FieldGroup>
        ) : null}
      </Tile>
      <Aside title="Before you start">
        <p>Copy off what you want to keep. Every disk is wiped, and Robot keeps no snapshots of dedicated servers.</p>
        <p>
          For your own partitions or RAID level, start the rescue system instead and run installimage there, Hetzner&apos;s
          installer.
        </p>
        <p>The new root password is shown once, right after you start.</p>
      </Aside>
      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
    </Board>
  )
}
