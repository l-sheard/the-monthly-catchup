# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A monthly newsletter app for friend groups. Each month every group member answers a shared set of prompts (what they've been up to, monthly favourites, a recipe, a photo, a voice note, a meetup suggestion); at the deadline all answers compile into one HTML newsletter emailed to the group and archived. pnpm workspace monorepo:

```
apps/
  mobile/   Expo (React Native + Expo Router) app — iOS, Android, and web from one codebase
  api/      Hono API on Cloudflare Workers
packages/
  shared/   Drizzle schema + Zod validators + wire types, imported by both apps
```

Product name in UI copy is "The Monthly Catch-Up"; package/repo names still say `stay-in-touch` / `mobile` — this mismatch is known, not a bug.

## Commands

Run from the repo root unless noted. `pnpm -r <script>` runs a script in every workspace package that defines it (silently skips packages that don't).

```bash
pnpm install
pnpm -r typecheck          # tsc --noEmit in all three packages
pnpm -r test                # vitest run in api + shared (mobile has no test script)
pnpm mobile                  # expo start --web --port default; press w/i/a for web/iOS/Android
pnpm api:dev                 # wrangler dev (apps/api)
pnpm api:deploy               # wrangler deploy --minify (apps/api)
```

Single test file or test name (vitest), from `apps/api` or `packages/shared`:

```bash
pnpm test -- path/to/file.test.ts
pnpm test -- -t "test name substring"
```

Mobile-only:

```bash
cd apps/mobile
pnpm typecheck
pnpm lint                    # expo lint — only package with a lint script
pnpm exec expo export --platform web   # full production web build; catches SSR-time errors typecheck can't (see Gotchas)
```

Database (Neon, via Drizzle) — from `apps/api`, after editing `packages/shared/src/schema.ts`:

```bash
pnpm db:generate    # drizzle-kit generate — writes a migration into apps/api/drizzle/
pnpm db:migrate      # drizzle-kit migrate — applies it to the linked Neon branch
```

The repo is linked to a real Neon project via `neon.ts` / `.neon` (gitignored). `neon status` shows the linked branch's live config; `neon checkout dev-<feature>` spins up an isolated branch (branch-first workflow).

Cloudflare Worker secrets/vars — from `apps/api`:

```bash
pnpm exec wrangler secret put <NAME>   # DATABASE_URL, CLERK_SECRET_KEY, RESEND_API_KEY, MEDIA_SIGNING_SECRET
pnpm exec wrangler types                 # regenerate worker-configuration.d.ts after changing wrangler.jsonc bindings
```

Non-secret vars (`CLERK_PUBLISHABLE_KEY`, `API_BASE_URL`) live directly in `wrangler.jsonc` and are safe to commit — they're meant to be public.

## Architecture

**Request flow**: mobile app → `apiFetch`/`uploadMedia` (`apps/mobile/src/lib/api.ts`, attaches the Clerk session token) → Hono routes on Cloudflare Workers → Drizzle → Neon Postgres. `packages/shared` is the single source of truth for the DB schema, Zod input validators, and response wire types, imported by both apps so client/server never drift.

**Auth and identity**: Clerk handles sign-in (Google SSO via `useSSO`, browser flow — works across Expo Go/dev builds/web from one code path). The API's `requireAuth` middleware (`apps/api/src/middleware/auth.ts`) verifies the session token, then calls `getOrCreateUser` (`apps/api/src/lib/get-or-create-user.ts`) to resolve/provision a row in our own `users` table keyed by `clerk_id`. **Every FK in the schema points at our own `users.id` (uuid), never Clerk's raw user ID** — this JIT-sync step is why; skipping it was a real bug found during development (inserts using the Clerk ID directly fail against the uuid columns). `requireAuth` also sets `db` in the Hono context, so route handlers pull it via `c.get('db')` instead of re-creating a Neon client per handler.

**Authorization**: no database-level RLS (this isn't Supabase) — every group-scoped route must call `assertGroupMember(db, groupId, userId)` (`apps/api/src/lib/authz.ts`) before touching data. Client-side route guards in the mobile app (the `(auth)`/`(home)` layout redirects) are UX only, not security.

**Data model** (`packages/shared/src/schema.ts`): `users` → `group_members` → `groups` → `cycles` → `answers` (one per user × question × cycle, unique constraint enforced) → `media`; `cycles` → `meetup_suggestions` → `meetup_votes`; `cycles` → `newsletters`. Default questions are seeded once (`is_default = true`, `group_id = null`), shared across all cycles/groups — not re-created per cycle.

**Media upload** (`apps/api/src/routes/media.ts`): uploads go straight through the Worker to R2 via multipart form data — not a presigned upload URL — since files are capped at 8MB and this way every upload (size, per-cycle quota, storage budget, group membership) is validated before a byte is written. Quotas live in `apps/api/src/lib/media-quota.ts`: `assertUnderMediaQuota` (per-person-per-cycle count limit) and `assertUnderStorageBudget` (global 9GB cutoff, summed from our own `media.size_bytes` rows, not an R2 API call). The bucket is private; in-app viewing goes through an authenticated `GET /media/:id`.

**Signed media URLs for email** (`apps/api/src/lib/media-signing.ts`): email clients can't send an Authorization header, so embedding photos/voice notes in the newsletter uses a self-issued HMAC signature (not R2's native S3-compatible presigning, which would need a separate R2 API token) — `GET /media/:id/public?expires=&sig=` verifies the signature and expiry before serving. The bucket stays private either way; a valid signature is what stands in for the Bearer token.

**Newsletter compile + send** (`apps/api/src/lib/newsletter.ts`): `sendNewsletterForCycle` gathers every member's answers + attached media + meetup suggestions for a cycle, renders one HTML email, and sends a copy to each member independently via Resend — one member's send failing (e.g. Resend's dev-sandbox restriction to the account owner's own address) doesn't block the others. Currently triggered manually (`POST /cycles/:id/send-newsletter`); the deadline-day auto-send and reminder emails are not built yet (see TODOs in `apps/api/src/index.ts`'s `scheduled` handler).

**Scheduled jobs**: Cloudflare Cron Trigger (`0 6 * * *`, see `wrangler.jsonc`) → the Worker's `scheduled` export in `apps/api/src/index.ts` → `openCyclesForToday` (`apps/api/src/jobs/open-cycles.ts`), which opens a new cycle for every group on the 1st of the month (no-ops other days). No third-party job platform — three straightforward scheduled jobs didn't justify one.

**Mobile routing**: Expo Router, file-based. `(auth)` and `(home)` are route groups (no URL segment) with their own guard in each `_layout.tsx`. `cycles/[id].tsx` is deliberately a top-level route, not nested under `(home)` — avoids relying on untested `Tabs`/`TabSlot` behavior for a non-tab child route — with its own inline `useAuth` guard instead of relying on the `(home)` layout's.

## Gotchas specific to this repo

- **`.npmrc` sets `node-linker=hoisted`.** Required — Metro (React Native's bundler) doesn't resolve pnpm's default strict-symlink `node_modules` layout (fails with `Unable to resolve module .../jsx-runtime`). Don't remove it.
- **Light mode only, deliberately.** `useTheme()` (`apps/mobile/src/hooks/use-theme.ts`) always returns `Colors.light`; no NativeWind `dark:` classes are used anywhere in the app. Don't add `colorScheme.set()` calls — NativeWind's default `darkMode: 'media'` strategy doesn't support manual overrides and throws at runtime, and calling it at module scope in `_layout.tsx` also breaks `expo export` (that file runs server-side during static rendering, no `window`).
- **`apiFetch`/`uploadMedia` aren't stable references** — they wrap Clerk's `getToken`, which gets a new identity most renders. Data-fetching `useEffect`s in screens deliberately run once on mount (empty dependency array, `eslint-disable-next-line react-hooks/exhaustive-deps`) rather than depending on them — depending on them caused a real infinite fetch loop (every fetch's `setState` → re-render → new function identity → effect re-fires) that hammered the deployed API. Follow the existing pattern in `apps/mobile/src/app/(home)/index.tsx` / `cycles/[id].tsx` when adding new data-fetching screens.
- **CORS is wide open (`origin: '*'`) on purpose** (`apps/api/src/index.ts`) — auth is a Bearer token the client attaches explicitly, not an ambient cookie credential, so wildcard CORS doesn't add CSRF risk here.
- **Verify web changes with `expo export --platform web`, not just `tsc`.** Expo statically server-renders every route during export; several real bugs (an SSR-incompatible `colorScheme.set()` call, a `Tabs` navigator with zero registered screens) only surfaced there, not in typecheck.
- **Wrangler dev/tail background processes don't fully die** when the parent task is stopped on this Windows setup — `workerd.exe`/child `node.exe` processes can linger and hold file locks (breaks subsequent `pnpm install`). Check `wmic process where "name='node.exe' or name='workerd.exe'"` and `taskkill //F //PID <pid> //T` if a command mysteriously hangs or `pnpm install` fails with `EPERM`.
