## What this changes

<!-- One or two sentences, and the issue it closes if there is one: Closes #123 -->

## How I tested it

<!-- Real Hetzner project, the mock (npm run mock), or which pages you clicked through. Admin and user? Light and dark theme? Phone width? -->

## Checklist

- [ ] `npm run lint`, `npm run typecheck` and `npm run build` pass
- [ ] No API tokens, passwords or real IP addresses in the code, screenshots or description
- [ ] New Hetzner calls go through an operation in `src/lib/operations.ts` that checks the user's assignment, permissions and input
