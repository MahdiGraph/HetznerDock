"use client"

import * as React from "react"
import Link from "next/link"
import type RFB from "@novnc/novnc"
import {
  ArrowLeftIcon,
  ArrowsClockwiseIcon,
  ArrowsInIcon,
  ArrowsOutIcon,
  CornersOutIcon,
  KeyboardIcon,
  TextAaIcon,
} from "@phosphor-icons/react"
import { StateMark } from "@/components/common"
import { LogoMark } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { errorMessage, hzCall, serverHref } from "@/lib/client"

type State = "requesting" | "connecting" | "connected" | "disconnected" | "failed"

const STATE_LABEL: Record<State, { mark: string; label: string }> = {
  requesting: { mark: "PENDING", label: "Asking Hetzner for access" },
  connecting: { mark: "STARTING", label: "Connecting" },
  connected: { mark: "RUNNING", label: "Connected" },
  disconnected: { mark: "OFF", label: "Disconnected" },
  failed: { mark: "ERROR", label: "Connection failed" },
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// X11 keysyms for the keys typed by "Type text".
const XK_SHIFT_L = 0xffe1
const XK_RETURN = 0xff0d
const XK_TAB = 0xff09
const SHIFTED = '~!@#$%^&*()_+{}|:"<>?'

/**
 * Types text as key presses. Hetzner's console has no clipboard, so this is how
 * a long password or a command gets in. Shift is pressed for capitals and the
 * symbols on the shifted keys of a US keyboard.
 */
async function typeText(rfb: RFB, text: string, isCancelled: () => boolean) {
  for (const ch of text.replace(/\r\n?/g, "\n")) {
    if (isCancelled()) return
    if (ch === "\n") rfb.sendKey(XK_RETURN, "Enter")
    else if (ch === "\t") rfb.sendKey(XK_TAB, "Tab")
    else {
      const code = ch.codePointAt(0) ?? 0
      const keysym = code < 0x100 ? code : 0x01000000 | code
      const shift = /[A-Z]/.test(ch) || SHIFTED.includes(ch)
      if (shift) rfb.sendKey(XK_SHIFT_L, "ShiftLeft", true)
      rfb.sendKey(keysym, null)
      if (shift) rfb.sendKey(XK_SHIFT_L, "ShiftLeft", false)
    }
    await sleep(15)
  }
}

export function ConsoleView({ project, id, name, allowed }: { project: number; id: number; name: string | null; allowed: boolean }) {
  const screen = React.useRef<HTMLDivElement>(null)
  const frame = React.useRef<HTMLDivElement>(null)
  const rfbRef = React.useRef<RFB | null>(null)
  const [state, setState] = React.useState<State>(allowed ? "requesting" : "failed")
  const [error, setError] = React.useState<string | null>(allowed ? null : "Your admin has turned the console off.")
  const [attempt, setAttempt] = React.useState(0)
  const [scale, setScale] = React.useState(true)
  const scaleRef = React.useRef(scale)
  const [typing, setTyping] = React.useState(false)

  React.useEffect(() => {
    scaleRef.current = scale
    if (rfbRef.current) rfbRef.current.scaleViewport = scale
  }, [scale])

  React.useEffect(() => {
    if (!allowed) return
    let cancelled = false
    let rfb: RFB | null = null
    void (async () => {
      try {
        // The address Hetzner hands out is valid for a minute, so it is asked for right before connecting.
        const res = await hzCall<{ wss_url: string; password: string }>(project, id, "POST", "actions/request_console")
        const { default: RFBClass } = await import("@novnc/novnc")
        if (cancelled || !screen.current) return
        setState("connecting")
        rfb = new RFBClass(screen.current, res.wss_url, { credentials: { password: res.password } })
        rfb.background = "#000000"
        rfb.scaleViewport = scaleRef.current
        rfb.addEventListener("connect", () => {
          setState("connected")
          setError(null)
          rfb?.focus()
        })
        rfb.addEventListener("disconnect", (e) => {
          const clean = (e as CustomEvent<{ clean: boolean }>).detail?.clean
          setState(clean ? "disconnected" : "failed")
          if (!clean) setError("The connection to Hetzner's console was lost. Connect again to get a fresh one.")
        })
        rfb.addEventListener("credentialsrequired", () => rfb?.sendCredentials({ password: res.password }))
        rfb.addEventListener("securityfailure", (e) => {
          const reason = (e as CustomEvent<{ reason?: string }>).detail?.reason
          setError(`Hetzner's console refused the login${reason ? `: ${reason}` : ""}.`)
        })
        rfbRef.current = rfb
      } catch (e) {
        if (cancelled) return
        setState("failed")
        setError(errorMessage(e))
      }
    })()
    return () => {
      cancelled = true
      rfb?.disconnect()
      rfbRef.current = null
    }
  }, [project, id, attempt, allowed])

  function reconnect() {
    setState("requesting")
    setError(null)
    setAttempt((n) => n + 1)
  }

  function fullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void frame.current?.requestFullscreen?.()
  }

  const connected = state === "connected"
  const status = STATE_LABEL[state]

  return (
    <div ref={frame} className="flex h-svh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 bg-card px-3 md:px-4">
        <Link href={serverHref(project, id)} className="flex min-w-0 items-center gap-2.5 outline-none" aria-label="Back to the server">
          <ArrowLeftIcon className="size-4 shrink-0 text-muted-foreground" />
          <LogoMark className="size-6 shrink-0" />
          <span className="truncate text-sm font-medium">{name ?? `Server ${id}`}</span>
        </Link>
        <StateMark state={status.mark} label={status.label} className="ml-2 hidden shrink-0 sm:inline-flex" />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <ToolButton label="Ctrl + Alt + Del" disabled={!connected} onClick={() => { rfbRef.current?.sendCtrlAltDel(); rfbRef.current?.focus() }}>
            <KeyboardIcon />
            <span className="hidden md:inline">Ctrl+Alt+Del</span>
          </ToolButton>
          <ToolButton label="Type text into the server" disabled={!connected} onClick={() => setTyping(true)}>
            <TextAaIcon />
            <span className="hidden md:inline">Type text</span>
          </ToolButton>
          <ToolButton label={scale ? "Show at real size" : "Fit to the window"} onClick={() => setScale((v) => !v)}>
            {scale ? <ArrowsOutIcon /> : <ArrowsInIcon />}
          </ToolButton>
          <ToolButton label="Full screen" onClick={fullscreen}>
            <CornersOutIcon />
          </ToolButton>
          {allowed ? (
            <ToolButton label="Connect again" disabled={state === "requesting" || state === "connecting"} onClick={reconnect}>
              {state === "requesting" || state === "connecting" ? <Spinner /> : <ArrowsClockwiseIcon />}
            </ToolButton>
          ) : null}
        </div>
      </header>
      <div className="relative min-h-0 flex-1 bg-black">
        <div ref={screen} className="absolute inset-0 overflow-auto" />
        {!connected ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-md bg-card p-6 text-card-foreground">
              <p className="display text-2xl">{status.label}</p>
              {error ? (
                <p className="prose-serif mt-3 text-base text-muted-foreground">{error}</p>
              ) : (
                <p className="prose-serif mt-3 text-base text-muted-foreground">
                  {state === "disconnected" ? "The session ended." : "This takes a few seconds."}
                </p>
              )}
              {allowed && (state === "failed" || state === "disconnected") ? (
                <Button className="mt-5" onClick={reconnect}>
                  <ArrowsClockwiseIcon /> Connect again
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <TypeDialog open={typing} onClose={() => setTyping(false)} rfb={rfbRef} />
    </div>
  )
}

function ToolButton({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 px-2.5" aria-label={label} disabled={disabled} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function TypeDialog({ open, onClose, rfb }: { open: boolean; onClose: () => void; rfb: React.RefObject<RFB | null> }) {
  const [text, setText] = React.useState("")
  const [enter, setEnter] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const cancelled = React.useRef(false)

  async function send() {
    const target = rfb.current
    if (!target || !text) return
    cancelled.current = false
    setBusy(true)
    onClose()
    await sleep(150)
    await typeText(target, enter ? `${text}\n` : text, () => cancelled.current)
    setBusy(false)
    setText("")
    target.focus()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="display text-2xl">Type text</DialogTitle>
          <DialogDescription className="prose-serif text-[15px]">
            The console has no clipboard. Paste here and Hetzner Dock types it key by key, for example a long password. It
            assumes a US keyboard layout on the server.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          className={/* taste-skill-ignore: typed console input is code */ "my-2 font-mono text-[13px]"}
          placeholder="Paste or write here"
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={enter} onCheckedChange={(v) => setEnter(!!v)} /> Press Enter at the end
        </label>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send} disabled={!text || busy || text.length > 4000}>
            {busy ? <Spinner /> : null} Type it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
