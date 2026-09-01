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

### Database (Neon)

The repo is linked to a real Neon project (`[neon-project]`, "Stay in touch")
via `neon.ts` / `.neon`. The `production` branch already has all 10 tables applied.

```bash
neon status                 # see the linked branch's live config
neon checkout dev-<feature> # spin up an isolated branch per feature (branch-first flow)
cd apps/api && pnpm db:generate && pnpm db:migrate   # after changing packages/shared/src/schema.ts
```

## Data model

See `packages/shared/src/schema.ts`. Summary:

```
users → group_members → groups
groups → cycles → answers → media
cycles → meetup_suggestions → meetup_votes
cycles → newsletters
```

Every group-scoped table traces back to `group_members` for authorization.
