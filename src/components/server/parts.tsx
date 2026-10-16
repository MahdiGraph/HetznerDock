"use client"

import * as React from "react"
import { Tile } from "@/components/board"
import { CopyButton } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="display mb-5 text-2xl">{children}</h2>
}

/** A grid of filled tiles to pick one option from, like the image grid on the Rebuild tab. */
export function ChoiceGrid({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string
  options: { value: string; label: string; detail?: string | null }[]
  value: string | null
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid gap-1 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {options.map((option) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-w-0 px-4 py-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "bg-primary text-primary-foreground" : "bg-tile hover:bg-accent"
            )}
          >
            <span className="block truncate text-sm font-medium">{option.label}</span>
            {option.detail ? (
              <span className={cn("block truncate text-[13px]", selected ? "opacity-80" : "text-muted-foreground")}>{option.detail}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
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
