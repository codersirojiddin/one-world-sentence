# One World Sentence

A real-time, collaborative writing experiment: people write stories together, one sentence at a
time — a shared global story anyone can join, plus personal and collaborative books that authors
fully control.

Built as a single Go binary (embedding a static Next.js export) so the entire app runs on
Render.com's free tier with Neon (Postgres + Auth) and Upstash (Redis) — **$0 hosting**.

## Features

- **The Global Story**: always open — any signed-in user may add one sentence every 24 hours.
- **Write your own book**: any signed-in user can start a new book. As the owner you can write to
  it freely (no 24h wait on your own book).
- **Collaborative books**: invite specific people (by email) to co-write a book with you. Invited
  collaborators can post anytime, no rate limit between the author team.
- **Optional public contributions**: as an owner, you can toggle "open for public" on your book —
  once enabled, any signed-in user may add one sentence to it every 24 hours, same as the global
  story. Off by default for new books.
- **Community moderation**: readers can flag a sentence. At 50% of the dynamic threshold
  (`MAX(5, 15% of today's active readers)`) it's blurred as `soft_hidden` (click to reveal); at
  100% it's hard-purged. `sequence_order` is never reassigned, so purges never break the story's
  numbering — the reader just skips the gap.
- **Real-time**: new sentences and moderation events stream to every connected browser instantly
  over Server-Sent Events.
- **Sign in with Google or email/password**, via Neon Auth — no separate auth provider needed
  since it lives right next to your Postgres database.
- **Personal bookshelf**: bookmark any book (yours, a collaborator's, or anyone's public book) to
  find it again later.
- **Profiles with unique usernames**: pick a `@username` (3-20 chars, lowercase/numbers/underscore),
  changeable once every 15 days. Every writer gets a public profile page at `/u?username=...`
  listing their books and total sentences written.
- **Download any book as a PDF**: a title page plus every sentence with its author, generated
  entirely in the browser (no server load, works even while the free-tier instance is asleep).
- **Cold-start resilience**: if the free-tier container is asleep and the first API call takes
  longer than 1.5s, the frontend shows a "Waking up the digital library..." loader.

## How access control works

Every book has an **owner**, a **mode** (`solo` or `collab`), and an `is_open_for_public` toggle:

| Who                              | Can post to a book when...                                  | Rate limit          |
|-----------------------------------|--------------------------------------------------------------|----------------------|
| The book's owner                  | always                                                        | none                 |
| An invited, active collaborator   | book mode is `collab` and they've signed in at least once     | none                 |
| Any other signed-in user          | the owner has switched **"open for public"** on               | 1 sentence / 24h     |
| Anyone not signed in               | can read, cannot write                                        | —                    |

The Global Story is a special book that's always `is_open_for_public = true`, with no single owner.

## Project layout

```
one-world-sentence/
├── frontend/            Next.js app (static export -> frontend/out)
│   └── src/
│       ├── app/          pages: /, /rooms, /my-books, /profile, /u, /auth/sign-in
│       ├── components/   StoryFeed, SentenceComposer/Input, ModerationModal, BookmarkButton,
│       │                 ExportPdfButton, AuthProvider, AccountControls, ...
│       └── lib/          auth.ts (Neon Auth client), sse.ts (apiFetch + EventSource),
│                         books.ts, profile.ts, pdf.ts (client-side jsPDF export)
├── backend/              Go server: REST API + SSE + embeds the frontend build
│   ├── auth/             Neon Auth JWT/JWKS verification middleware
│   ├── db/                Postgres schema + Redis rate limiter
│   └── handlers/          sentence.go, book.go, profile.go, sse.go
├── render.yaml            Render.com deployment blueprint
```

## Setting up the free-tier services

### 1. Neon (Postgres + Auth)
1. Create a project at [neon.tech](https://neon.tech).
2. Copy the **pooled connection string** (Dashboard → Connect) → this is `DATABASE_URL`.
3. Open the **Auth** tab in the Neon Console and enable it. Turn on **Google** as a sign-in
   method (Neon provides shared dev credentials, so this works immediately with no Google Cloud
   setup — swap in your own OAuth client before going to production) and make sure
   **email/password** sign-in is enabled too.
4. Copy the **Auth URL** shown in that tab (looks like
   `https://ep-xxxx.neonauth.c-2.<region>.aws.neon.build/neondb/auth`). You'll need it twice:
   - as `NEXT_PUBLIC_NEON_AUTH_URL` (frontend, used as-is)
   - as `NEON_AUTH_JWKS_URL` (backend, with `/.well-known/jwks.json` appended)

### 2. Upstash (Redis)
Create a Redis database at [upstash.com](https://upstash.com) → copy the `rediss://` connection
string → this is `UPSTASH_REDIS_URL`.

## Local development

### Backend
```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL, UPSTASH_REDIS_URL, NEON_AUTH_JWKS_URL
go mod tidy
go run .
```
Runs on `http://localhost:8080` and auto-creates its schema on boot (`db/db.go`).

### Frontend (dev mode, talking to the Go API directly)
```bash
cd frontend
cp .env.local.example .env.local   # fill in NEXT_PUBLIC_NEON_AUTH_URL
npm install
npm run dev
```
Visit `http://localhost:3000`. `NEXT_PUBLIC_API_BASE=http://localhost:8080` in `.env.local`
points the frontend at your local Go server during development.

## Production build (single binary)

```bash
cd frontend
npm install
NEXT_PUBLIC_NEON_AUTH_URL=<your Auth URL> npm run build   # writes the static export to frontend/out

cd ../backend
rm -rf out && cp -r ../frontend/out .
go build -o server .
./server                # serves frontend + API on the same port
```

## Deploying to Render.com

1. Push this repo to GitHub (the `.gitignore` already excludes your `.env` files with real
   secrets — double check they're not staged before your first commit).
2. In Render, create a **Blueprint** from `render.yaml`.
3. Set these env vars in the Render dashboard: `DATABASE_URL`, `UPSTASH_REDIS_URL`,
   `NEON_AUTH_JWKS_URL`, `NEXT_PUBLIC_NEON_AUTH_URL`.
4. Deploy — Render builds the frontend, embeds it into the Go binary, and serves everything from
   one free web service.

## API reference

| Method | Path                                        | Auth        | Description                                    |
|--------|----------------------------------------------|-------------|--------------------------------------------------|
| GET    | `/api/health`                                 | —           | Liveness check                                    |
| GET    | `/api/stream?book_id=`                        | —           | SSE stream of new/moderated sentences             |
| GET    | `/api/sentences?book_id=`                     | optional    | List visible/soft-hidden sentences in order       |
| POST   | `/api/sentences`                              | required    | Submit a sentence (owner/collab bypass rate limit) |
| GET    | `/api/sentences/{id}/reveal`                  | —           | Reveal a soft-hidden sentence's true content       |
| POST   | `/api/sentences/{id}/flag`                    | required    | Flag/vote to delete a sentence                     |
| GET    | `/api/books`                                  | optional    | List the global story + all books                  |
| GET    | `/api/books/{id}`                             | optional    | Book details incl. `is_owner`/`is_collaborator`    |
| GET    | `/api/books/mine`                             | required    | Books you own or collaborate on                    |
| GET    | `/api/books/bookmarked`                       | required    | Your personal bookshelf                            |
| POST   | `/api/books`                                  | required    | Create a book (`mode`: `solo`\|`collab`)           |
| PATCH  | `/api/books/{id}`                             | owner only  | Update title/description/mode/`is_open_for_public` |
| GET    | `/api/books/{id}/collaborators`               | owner only  | List invited collaborators                         |
| POST   | `/api/books/{id}/collaborators`               | owner only  | Invite a collaborator by email                     |
| DELETE | `/api/books/{id}/collaborators/{cid}`         | owner only  | Remove a collaborator                              |
| POST   | `/api/books/{id}/bookmark`                    | required    | Toggle a bookshelf bookmark                         |
| GET    | `/api/users/{id}/sentences`                   | —           | A user's submitted sentence history                 |
| GET    | `/api/profiles/me`                            | required    | Your own profile (`{exists:false}` if not set up)  |
| PUT    | `/api/profiles/me`                            | required    | Create/update username (15-day cooldown), bio, name |
| GET    | `/api/profiles/check?username=`               | optional    | Live username-availability check                    |
| GET    | `/api/profiles/{username}`                    | —           | A writer's public profile + their public books       |

`"required"` endpoints expect `Authorization: Bearer <Neon Auth JWT>`.

## Implementation notes

- **Auth**: the frontend uses `@neondatabase/neon-js` / `@neondatabase/auth-ui`
  (`createInternalNeonAuth` + `NeonAuthUIProvider`) for Google + email/password sign-in entirely
  client-side — compatible with the static export, no Next.js server routes required. Before each
  authenticated API call, the frontend fetches a fresh short-lived JWT via `getJWTToken()` and
  sends it as a Bearer token. The Go backend verifies it locally against Neon Auth's JWKS endpoint
  (`backend/auth/auth.go`), so no round-trip to Neon is needed per request.
- **Collaborator invites**: inviting someone by email creates a `pending` row in
  `book_collaborators`. The first time that person signs in (to anything in the app), the backend
  auth middleware matches their verified email and flips the invite to `active` automatically —
  no separate "accept invite" flow needed.
- **Dynamic flag threshold**: reads today's "active reader" count from a Redis set populated on
  every `GET /api/sentences` call, expiring after 48h to keep memory bounded on Upstash's free tier.
- This was verified end-to-end during development: `npm install` + `npx tsc --noEmit` +
  `npx next build` all pass cleanly against the real, currently-published Neon Auth packages, and
  the Go backend was confirmed to resolve/build against its real dependencies (this sandbox's
  network denies one unrelated test-only transitive package, `gopkg.in/yaml.v3`, which has no
  effect on a normal `go build` outside this sandbox).

## Security note

The `backend/.env` and `frontend/.env.local` files in this project are pre-filled with the
credentials you shared so it runs immediately — they're already excluded from git via
`.gitignore`. If this code is ever pushed somewhere public, rotate the Neon and Upstash
credentials from their dashboards first.
