# Contributing to Hetzner Dock

Thanks for helping. Bug reports, ideas and pull requests are all welcome.

## Report a bug or ask for a feature

Open an [issue](https://github.com/MahdiGraph/HetznerDock/issues/new/choose) and pick the matching form. For bugs, the version (shown in `docker image inspect ghcr.io/mahdigraph/hetznerdock`), how you installed it and the exact error text help most. Never paste API tokens, passwords or real IP addresses.

Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Run it locally

You need Node.js 20.9 or newer.

```bash
git clone https://github.com/MahdiGraph/HetznerDock.git
cd HetznerDock
npm install
npm run dev
```

Open http://localhost:3000 (use `localhost`, not `127.0.0.1`: the dev server only serves its scripts to the host it started on). The first visit asks you to create the admin. The database goes to `./data`, which is ignored by git.

### Without a Hetzner account

`npm run mock` starts a fake Hetzner Cloud API on http://localhost:4010 with two projects, eight servers, snapshots, firewalls, metrics and a small VNC console. In the panel, open *Settings → API address*, enter `http://localhost:4010/v1`, and add the tokens the mock prints as projects. Plain `http` is accepted only for an address on this machine.

Actions in the mock take a few seconds and change the servers the way Hetzner would, so every screen can be clicked through. Its data lives in memory and resets when it restarts.

## Where things live

| Path | What it holds |
| --- | --- |
| `src/lib/hetzner.ts` | The only code that talks to the Hetzner API, including the outbound proxy and rate limit tracking. |
| `src/lib/operations.ts` | Everything users can do with a server. A new feature usually starts here: each operation checks its input and permission and says what to log. |
| `src/lib/permissions.ts` | The switches under *Settings → What users can do*. |
| `src/lib/db.ts` | SQLite schema and numbered migrations. Never edit a migration that has shipped; add a new one. |
| `src/app/api/` | Route handlers. Every one goes through `route()` in `src/lib/http.ts`. |
| `src/components/server/` | The server page tabs. |
| `src/components/console/` | The noVNC console. |
| `src/components/ui/` | shadcn/ui components. |
| `scripts/mock-hetzner.mjs` | The fake Hetzner API for development. |

## Before you open a pull request

```bash
npm run lint
npm run typecheck
npm run build
```

All three must pass. Please also:

- keep the user interface in English,
- follow the existing look: flat surfaces, no gradients, no shadows on things at rest, square corners (see the house rules in `.claude/skills/design-taste-frontend/SKILL.md`),
- check both the light and the dark theme, and a phone-sized window,
- try your change against the mock, and as a user as well as an admin,
- describe in the pull request what you changed and how you tested it.

Small, focused pull requests are reviewed fastest.
