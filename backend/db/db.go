package db

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

var Pool *pgxpool.Pool

// Connect initializes the Postgres connection pool (Neon.tech free tier).
// Neon requires sslmode=require in the connection string.
func Connect() error {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		return fmt.Errorf("DATABASE_URL environment variable is not set")
	}

	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return fmt.Errorf("failed to parse DATABASE_URL: %w", err)
	}

	// Free-tier friendly pool sizing — Neon free tier caps concurrent connections.
	cfg.MaxConns = 8
	cfg.MinConns = 0
	cfg.MaxConnLifetime = 30 * time.Minute
	cfg.MaxConnIdleTime = 5 * time.Minute

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return fmt.Errorf("failed to create connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	Pool = pool
	log.Println("[db] connected to Postgres (Neon)")
	return Migrate(ctx)
}

// Migrate creates all tables if they do not already exist.
// Kept dependency-free (no external migration tool) to match the $0 free-tier stack.
func Migrate(ctx context.Context) error {
	schema := `
	CREATE EXTENSION IF NOT EXISTS pgcrypto;

	-- NOTE: user identities themselves are managed by Neon Auth (Google + email/password),
	-- stored in the neon_auth schema of this same database. We only store the user's
	-- id/name/email as plain TEXT snapshots here — no local password/users table.

	CREATE TABLE IF NOT EXISTS books (
		id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		title               TEXT NOT NULL,
		genre               TEXT NOT NULL DEFAULT 'general',
		description         TEXT,
		is_global           BOOLEAN NOT NULL DEFAULT false, -- true only for the single main story
		owner_user_id       TEXT, -- Neon Auth user id; NULL for the global story
		owner_name          TEXT,
		mode                TEXT NOT NULL DEFAULT 'solo', -- 'solo' | 'collab'
		is_open_for_public  BOOLEAN NOT NULL DEFAULT false, -- owner toggle: allow any signed-in user to add 1 sentence/24h
		created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
	);

	CREATE TABLE IF NOT EXISTS profiles (
		user_id             TEXT PRIMARY KEY,
		username            TEXT NOT NULL,
		display_name        TEXT,
		bio                 TEXT,
		username_changed_at TIMESTAMPTZ,
		created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
	);
	CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower ON profiles (lower(username));
	ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;

	CREATE TABLE IF NOT EXISTS banned_users (
		user_id    TEXT PRIMARY KEY,
		email      TEXT,
		reason     TEXT,
		banned_by  TEXT,
		banned_at  TIMESTAMPTZ NOT NULL DEFAULT now()
	);

	CREATE TABLE IF NOT EXISTS book_collaborators (
		id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		book_id        UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
		invited_email  TEXT NOT NULL,
		user_id        TEXT, -- filled in once the invited email signs in for the first time
		user_name      TEXT,
		status         TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'active'
		created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
		UNIQUE (book_id, invited_email)
	);

	CREATE TABLE IF NOT EXISTS sentences (
		id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		book_id         UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
		sequence_order  BIGINT NOT NULL,
		content         TEXT NOT NULL CHECK (char_length(content) <= 280),
		author_user_id  TEXT NOT NULL,
		author_name     TEXT,
		status          TEXT NOT NULL DEFAULT 'visible', -- visible | soft_hidden | deleted
		flag_count      INTEGER NOT NULL DEFAULT 0,
		created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
		UNIQUE (book_id, sequence_order)
	);
	CREATE INDEX IF NOT EXISTS idx_sentences_book_seq ON sentences (book_id, sequence_order ASC);
	CREATE INDEX IF NOT EXISTS idx_sentences_status ON sentences (status);

	CREATE TABLE IF NOT EXISTS sentence_flags (
		id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		sentence_id   UUID NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
		voter_user_id TEXT NOT NULL,
		created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
		UNIQUE (sentence_id, voter_user_id)
	);

	CREATE TABLE IF NOT EXISTS bookmarks (
		user_id    TEXT NOT NULL,
		book_id    UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		PRIMARY KEY (user_id, book_id)
	);

	CREATE TABLE IF NOT EXISTS daily_active_readers (
		book_id     UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
		day         DATE NOT NULL DEFAULT CURRENT_DATE,
		reader_hash TEXT NOT NULL,
		PRIMARY KEY (book_id, day, reader_hash)
	);

	-- Seed the default global story if it doesn't exist. Always open for public contribution.
	INSERT INTO books (id, title, genre, description, is_global, mode, is_open_for_public, created_at)
	SELECT '00000000-0000-0000-0000-000000000001', 'One World Sentence', 'general',
	       'The main global live story stream.', true, 'collab', true, now()
	WHERE NOT EXISTS (SELECT 1 FROM books WHERE id = '00000000-0000-0000-0000-000000000001');
	`

	if _, err := Pool.Exec(ctx, schema); err != nil {
		return fmt.Errorf("migration failed: %w", err)
	}
	log.Println("[db] schema migration complete")
	return nil
}

func Close() {
	if Pool != nil {
		Pool.Close()
	}
}

// IsUserBanned checks whether a user is currently banned from writing (posting/flagging/etc).
// Banned users can still read the site — only auth.Required-gated write endpoints check this.
func IsUserBanned(ctx context.Context, userID string) (bool, error) {
	var banned bool
	err := Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM banned_users WHERE user_id = $1)`, userID).Scan(&banned)
	return banned, err
}

// SyncCollaboratorInvites activates any pending book_collaborators rows whose invited_email
// matches this now-authenticated user, attaching their real user_id/name. Called right after
// JWT verification so invites resolve automatically the first time the invitee signs in.
func SyncCollaboratorInvites(ctx context.Context, userID, email, name string) error {
	if email == "" {
		return nil
	}
	_, err := Pool.Exec(ctx, `
		UPDATE book_collaborators
		SET user_id = $1, user_name = $2, status = 'active'
		WHERE lower(invited_email) = lower($3) AND status = 'pending'
	`, userID, name, email)
	return err
}
