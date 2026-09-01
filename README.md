# Stay In Touch

A monthly newsletter for friend groups. Each month, every member answers a
shared set of prompts — what they've been up to, monthly favourites
(books/TV/music/etc, framed as recommendations to the group), a recipe or
thing to share, photos, a voice note, and a suggestion for the next meetup.
When the cycle closes, all answers compile into a newsletter that's emailed
to the group and archived permanently.

## Monorepo layout

```
apps/
  mobile/   Expo (React Native + Expo Router) app — iOS, Android, and web from one codebase
  api/      Hono API on Cloudflare Workers
packages/
  shared/   Drizzle schema + Zod validators shared by both apps
```

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Expo + Expo Router + NativeWind | One codebase → App Store, Play Store, and web |
| Auth | Clerk (Google sign-in) | Native Expo SDK, no backend session plumbing to hand-roll |
| API | Hono on Cloudflare Workers | Serverless, free tier, no server to manage |
| Database | Neon (serverless Postgres) + Drizzle | Relational data model, scale-to-zero (no pause-and-restore like Supabase's free tier) |
| Storage | Cloudflare R2 | Photos + voice notes, S3-compatible, zero egress fees |
| Email | Resend + React Email | Newsletter delivery |
| Jobs | Inngest | Cycle open, deadline reminders, compile + send |
| Store distribution | EAS Build/Submit | Apple Developer ($99/yr) + Google Play ($25 one-time) |

There is no database-level Row-Level-Security here (that was a Supabase-specific
convenience). Authorization is enforced in the API layer instead — every
group-scoped route calls `assertGroupMember` (see `apps/api/src/lib/authz.ts`)
before touching group data.

## Getting started

```bash
pnpm install

# API (Hono / Cloudflare Workers)
cp apps/api/.dev.vars.example apps/api/.dev.vars   # fill in CLERK_SECRET_KEY, RESEND_API_KEY (DATABASE_URL is already set — see below)
pnpm api:dev

# Mobile app
pnpm mobile        # then press w for web, i for iOS simulator, a for Android
```

### Auth (Clerk)

Real Clerk app ("Stay In Touch", `[clerk-app-id]`), linked via the
Clerk CLI. Google sign-in uses the browser SSO flow (`useSSO`), which works across
Expo Go, dev builds, and web from one code path — see
`apps/mobile/src/app/(auth)/sign-in.tsx`. Routes are split into `(auth)` (public,
redirects away if already signed in) and `(home)` (protected, redirects to sign-in)
groups; the API verifies the session token server-side in
`apps/api/src/middleware/auth.ts` — the client-side guards are UX only, not security.

Google sign-in works out of the box in development (Clerk's shared dev OAuth
credentials, already enabled on the instance). Still needed before a real native
build can sign in: register the app's bundle ID/package name under Clerk Dashboard
→ **Native applications** (comes naturally with EAS setup), and before a real
production release: your own Google OAuth client, plus Sign in with Apple
alongside it (Apple requires offering it if you offer any third-party sign-in on iOS).

```bash
pnpm dlx clerk@latest env pull --app [clerk-app-id]   # refresh keys
```

### Database (Neon)

The repo is linked to a real Neon project (`[neon-project]`, "Stay in touch")
via `neon.ts` / `.neon`. The `production` branch already has all 10 tables applied.

```bash
neon status                 # see the linked branch's live config
neon checkout dev-<feature> # spin up an isolated branch per feature (branch-first flow)
cd apps/api && pnpm db:generate && pnpm db:migrate   # after changing packages/shared/src/schema.ts
```

### API deployment (Cloudflare Workers + R2)

Deployed and verified live at **https://stay-in-touch-api.lara-sheard9.workers.dev**
(health check, R2 binding, and Clerk-authenticated routes all confirmed working
over the real internet, not just local dev). The `stay-in-touch-media` R2 bucket
exists and is bound as `MEDIA_BUCKET`. Secrets (`DATABASE_URL`, `CLERK_SECRET_KEY`,
`RESEND_API_KEY`) are set on the deployed Worker via `wrangler secret put`, separate
from the local-only `.dev.vars` file.

```bash
cd apps/api
pnpm exec wrangler secret put <NAME>   # update a deployed secret
pnpm deploy                            # wrangler deploy --minify
```

`RESEND_API_KEY` is still a placeholder — fine for now since nothing calls Resend yet.

## Data model

See `packages/shared/src/schema.ts`. Summary:

```
users → group_members → groups
groups → cycles → answers → media
cycles → meetup_suggestions → meetup_votes
cycles → newsletters
```

Every group-scoped table traces back to `group_members` for authorization.
