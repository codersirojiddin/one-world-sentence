package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"one-world-sentence/backend/auth"
	"one-world-sentence/backend/db"

	"github.com/go-chi/chi/v5"
)

// AdminStats handles GET /api/admin/stats — top-level dashboard numbers.
func AdminStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	stats := map[string]int64{}

	queries := map[string]string{
		"total_users": `
			SELECT COUNT(*) FROM (
				SELECT author_user_id AS uid FROM sentences
				UNION SELECT owner_user_id FROM books WHERE owner_user_id IS NOT NULL
				UNION SELECT user_id FROM profiles
			) t`,
		"total_books":           `SELECT COUNT(*) FROM books WHERE is_global = false`,
		"total_sentences":       `SELECT COUNT(*) FROM sentences WHERE status != 'deleted'`,
		"soft_hidden_sentences": `SELECT COUNT(*) FROM sentences WHERE status = 'soft_hidden'`,
		"deleted_sentences":     `SELECT COUNT(*) FROM sentences WHERE status = 'deleted'`,
		"collaborative_books":   `SELECT COUNT(*) FROM books WHERE mode = 'collab' AND is_global = false`,
		"public_books":          `SELECT COUNT(*) FROM books WHERE is_open_for_public = true AND is_global = false`,
		"banned_users":          `SELECT COUNT(*) FROM banned_users`,
		"profiles_created":      `SELECT COUNT(*) FROM profiles`,
	}

	for key, q := range queries {
		var n int64
		if err := db.Pool.QueryRow(ctx, q).Scan(&n); err == nil {
			stats[key] = n
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

type AdminBookRow struct {
	Book
	SentenceCount int `json:"sentence_count"`
	FlaggedCount  int `json:"flagged_count"`
}

// AdminListBooks handles GET /api/admin/books — every book with moderation-relevant counts.
func AdminListBooks(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	rows, err := db.Pool.Query(ctx, `
		SELECT b.id, b.title, b.genre, COALESCE(b.description, ''), b.is_global, b.owner_user_id,
		       b.owner_name, b.mode, b.is_open_for_public, b.created_at,
		       (SELECT COUNT(*) FROM sentences s WHERE s.book_id = b.id AND s.status != 'deleted'),
		       (SELECT COUNT(*) FROM sentences s WHERE s.book_id = b.id AND s.status = 'soft_hidden')
		FROM books b
		ORDER BY b.created_at DESC
	`)
	if err != nil {
		http.Error(w, "failed to load books", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	books := make([]AdminBookRow, 0)
	for rows.Next() {
		var b AdminBookRow
		if err := rows.Scan(&b.ID, &b.Title, &b.Genre, &b.Description, &b.IsGlobal, &b.OwnerUserID,
			&b.OwnerName, &b.Mode, &b.IsOpenForPublic, &b.CreatedAt, &b.SentenceCount, &b.FlaggedCount); err != nil {
			http.Error(w, "failed to scan book", http.StatusInternalServerError)
			return
		}
		books = append(books, b)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(books)
}

// AdminDeleteBook handles DELETE /api/admin/books/{id} — permanently removes a book
// and (via ON DELETE CASCADE) all of its sentences, flags, and collaborator invites.
func AdminDeleteBook(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "00000000-0000-0000-0000-000000000001" {
		http.Error(w, "the global story cannot be deleted", http.StatusForbidden)
		return
	}
	if _, err := db.Pool.Exec(r.Context(), `DELETE FROM books WHERE id = $1`, id); err != nil {
		http.Error(w, "failed to delete book", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type AdminSentenceRow struct {
	Sentence
	BookTitle string `json:"book_title"`
}

type sentenceRowsScanner interface {
	Next() bool
	Scan(...interface{}) error
	Close()
}

// AdminListSentences handles GET /api/admin/sentences?status=soft_hidden|deleted|all
// Defaults to soft_hidden (the moderation queue admins most often need to review).
func AdminListSentences(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	status := r.URL.Query().Get("status")
	if status == "" {
		status = "soft_hidden"
	}

	var rows sentenceRowsScanner
	var err error
	if status == "all" {
		rows, err = db.Pool.Query(ctx, `
			SELECT s.id, s.book_id, s.sequence_order, s.content, s.author_user_id, s.author_name,
			       s.status, s.flag_count, s.created_at, b.title
			FROM sentences s JOIN books b ON b.id = s.book_id
			ORDER BY s.created_at DESC LIMIT 300
		`)
	} else {
		rows, err = db.Pool.Query(ctx, `
			SELECT s.id, s.book_id, s.sequence_order, s.content, s.author_user_id, s.author_name,
			       s.status, s.flag_count, s.created_at, b.title
			FROM sentences s JOIN books b ON b.id = s.book_id
			WHERE s.status = $1
			ORDER BY s.created_at DESC LIMIT 300
		`, status)
	}
	if err != nil {
		http.Error(w, "failed to load sentences", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	sentences := make([]AdminSentenceRow, 0)
	for rows.Next() {
		var s AdminSentenceRow
		var authorName *string
		if err := rows.Scan(&s.ID, &s.BookID, &s.SequenceOrder, &s.Content, &s.AuthorUserID, &authorName,
			&s.Status, &s.FlagCount, &s.CreatedAt, &s.BookTitle); err != nil {
			http.Error(w, "failed to scan sentence", http.StatusInternalServerError)
			return
		}
		if authorName != nil {
			s.AuthorName = *authorName
		}
		sentences = append(sentences, s)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sentences)
}

type adminUpdateSentenceRequest struct {
	Status string `json:"status"` // "visible" (restore) | "deleted" (force purge) | "soft_hidden"
}

// AdminUpdateSentenceStatus handles PATCH /api/admin/sentences/{id} — restore a
// soft-hidden sentence back to visible, or force-delete it, overriding the community vote.
func AdminUpdateSentenceStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req adminUpdateSentenceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Status != "visible" && req.Status != "deleted" && req.Status != "soft_hidden" {
		http.Error(w, "status must be visible, soft_hidden, or deleted", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	if _, err := db.Pool.Exec(ctx, `UPDATE sentences SET status = $1 WHERE id = $2`, req.Status, id); err != nil {
		http.Error(w, "failed to update sentence", http.StatusInternalServerError)
		return
	}

	var bookID string
	_ = db.Pool.QueryRow(ctx, `SELECT book_id FROM sentences WHERE id = $1`, id).Scan(&bookID)
	if bookID != "" {
		GlobalHub.Broadcast(bookID, SSEEvent{Type: "sentence.moderated", Data: map[string]interface{}{
			"id": id, "status": req.Status, "flag_count": 0, "threshold": 0,
		}})
	}

	w.WriteHeader(http.StatusNoContent)
}

type AdminUserRow struct {
	UserID        string  `json:"user_id"`
	Username      *string `json:"username,omitempty"`
	DisplayName   *string `json:"display_name,omitempty"`
	Email         *string `json:"email,omitempty"`
	SentenceCount int     `json:"sentence_count"`
	BookCount     int     `json:"book_count"`
	Banned        bool    `json:"banned"`
	BanReason     *string `json:"ban_reason,omitempty"`
}

// AdminListUsers handles GET /api/admin/users — everyone who has ever written a sentence,
// owns a book, or has set up a profile, with moderation-relevant counts.
func AdminListUsers(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	rows, err := db.Pool.Query(ctx, `
		WITH all_users AS (
			SELECT DISTINCT uid FROM (
				SELECT author_user_id AS uid FROM sentences
				UNION SELECT owner_user_id FROM books WHERE owner_user_id IS NOT NULL
				UNION SELECT user_id FROM profiles
			) t
		)
		SELECT au.uid, p.username, p.display_name, p.email,
		       (SELECT COUNT(*) FROM sentences s WHERE s.author_user_id = au.uid AND s.status != 'deleted'),
		       (SELECT COUNT(*) FROM books b WHERE b.owner_user_id = au.uid),
		       bu.user_id IS NOT NULL, bu.reason
		FROM all_users au
		LEFT JOIN profiles p ON p.user_id = au.uid
		LEFT JOIN banned_users bu ON bu.user_id = au.uid
		ORDER BY 5 DESC
		LIMIT 500
	`)
	if err != nil {
		http.Error(w, "failed to load users", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	users := make([]AdminUserRow, 0)
	for rows.Next() {
		var u AdminUserRow
		if err := rows.Scan(&u.UserID, &u.Username, &u.DisplayName, &u.Email,
			&u.SentenceCount, &u.BookCount, &u.Banned, &u.BanReason); err != nil {
			http.Error(w, "failed to scan user", http.StatusInternalServerError)
			return
		}
		users = append(users, u)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

type banUserRequest struct {
	Reason string `json:"reason"`
}

// AdminBanUser handles POST /api/admin/users/{id}/ban — blocks the user from posting,
// flagging, creating books, etc. Reading the site remains unaffected.
func AdminBanUser(w http.ResponseWriter, r *http.Request) {
	admin := auth.FromContext(r.Context())
	userID := chi.URLParam(r, "id")

	var req banUserRequest
	_ = json.NewDecoder(r.Body).Decode(&req)
	req.Reason = strings.TrimSpace(req.Reason)

	var email *string
	_ = db.Pool.QueryRow(r.Context(), `SELECT email FROM profiles WHERE user_id = $1`, userID).Scan(&email)

	adminEmail := ""
	if admin != nil {
		adminEmail = admin.Email
	}

	_, err := db.Pool.Exec(r.Context(), `
		INSERT INTO banned_users (user_id, email, reason, banned_by, banned_at)
		VALUES ($1, $2, $3, $4, now())
		ON CONFLICT (user_id) DO UPDATE SET reason = $3, banned_by = $4, banned_at = now()
	`, userID, email, req.Reason, adminEmail)
	if err != nil {
		http.Error(w, "failed to ban user", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// AdminUnbanUser handles DELETE /api/admin/users/{id}/ban.
func AdminUnbanUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	if _, err := db.Pool.Exec(r.Context(), `DELETE FROM banned_users WHERE user_id = $1`, userID); err != nil {
		http.Error(w, "failed to unban user", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
