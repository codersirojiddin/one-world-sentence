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
- **Personal bookshelf**: bookmark any book to find it again later.
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
│       ├── app/          pages: /, /rooms, /my-books, /auth/sign-in
│       ├── components/   StoryFeed, SentenceComposer/Input, ModerationModal, AuthProvider, ...
│       └── lib/          auth.ts (Neon Auth client), sse.ts (apiFetch + EventSource), books.ts
├── backend/              Go server: REST API + SSE + embeds the frontend build
│   ├── auth/             Neon Auth JWT/JWKS verification middleware
│   ├── db/                Postgres schema + Redis rate limiter
│   └── handlers/          sentence.go, book.go, sse.go
├── render.yaml            Render.com deployment blueprint
```
tate the Neon and Upstash
credentials from their dashboards first.
