# One World Sentence

A real-time, collaborative writing experiment: people write stories together, one sentence at a
time — a shared global story anyone can join, plus personal and collaborative books that authors
fully control.

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
- **Admin panel** (`/admin`, gated by `ADMIN_EMAILS`): a stats dashboard (users, books, sentences,
  flagged/deleted counts), a books view with force-delete, a moderation queue for soft-hidden/
  deleted sentences with restore/purge actions, and a users view to ban/unban writers (banning
  blocks posting/flagging/creating books, but reading stays open).
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
