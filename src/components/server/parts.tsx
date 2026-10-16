"use client"

import * as React from "react"
import { Tile } from "@/components/board"
import { CopyButton } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="display mb-5 text-2xl">{children}</h2>
}

/** The side tile next to a form: what happens, what to know. */
export function Aside({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Tile tone="tile" className={className ?? "col-span-12 lg:col-span-4"}>
      <h3 className="display text-xl">{title}</h3>
      <div className="prose-serif mt-3 grid gap-3 text-[15px] text-muted-foreground">{children}</div>
    </Tile>
  )
}

export type Secret = { title: string; password: string | null; description: React.ReactNode }

/**
 * Shows a password Hetzner returned once. It is never stored by the panel, so
 * the dialog asks for a copy before it closes.
 */
export function SecretDialog({ secret, onClose }: { secret: Secret | null; onClose: () => void }) {
  return (
    <Dialog open={!!secret} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        {secret ? (
          <>
            <DialogHeader>
              <DialogTitle className="display text-2xl">{secret.title}</DialogTitle>
              <DialogDescription asChild>
                <div className="prose-serif text-[15px]">{secret.description}</div>
              </DialogDescription>
            </DialogHeader>
            {secret.password ? (
              <div className="my-4 flex items-center gap-2 bg-muted p-3">
                <code className="min-w-0 flex-1 text-base break-all select-all">{secret.password}</code>
                <CopyButton value={secret.password} label="Copy password" />
              </div>
            ) : null}
            {secret.password ? (
              <p className="text-sm text-muted-foreground">
                Hetzner Dock does not keep this password. Copy it now; it is not shown again.
              </p>
            ) : null}
            <DialogFooter>
              <Button onClick={onClose}>{secret.password ? "I have copied it" : "Close"}</Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
