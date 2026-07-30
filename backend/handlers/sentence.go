package handlers

import (
	"encoding/json"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"one-world-sentence/backend/auth"
	"one-world-sentence/backend/db"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

const maxSentenceLength = 280
const defaultBookID = "00000000-0000-0000-0000-000000000001"

type Sentence struct {
	ID            string    `json:"id"`
	BookID        string    `json:"book_id"`
	SequenceOrder int64     `json:"sequence_order"`
	Content       string    `json:"content"`
	AuthorUserID  string    `json:"author_user_id"`
	AuthorName    string    `json:"author_name"`
	Status        string    `json:"status"` // visible | soft_hidden | deleted
	FlagCount     int       `json:"flag_count"`
	CreatedAt     time.Time `json:"created_at"`
}

type createSentenceRequest struct {
	Content string `json:"content"`
	BookID  string `json:"book_id,omitempty"`
}

func clientFingerprint(r *http.Request) string {
	ip := r.Header.Get("X-Forwarded-For")
	if ip == "" {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err == nil {
			ip = host
		} else {
			ip = r.RemoteAddr
		}
	} else {
		ip = strings.TrimSpace(strings.Split(ip, ",")[0])
	}
	return db.HashFingerprint(ip, r.UserAgent())
}

// bookAccess describes what the current identity is allowed to do on a book.
type bookAccess struct {
	OwnerUserID     *string
	Mode            string
	IsOpenForPublic bool
	IsOwnerOrCollab bool
}

func loadBookAccess(w http.ResponseWriter, r *http.Request, bookID, userID string) (*bookAccess, bool) {
	ctx := r.Context()
	var ownerUserID *string
	var mode string
	var isOpen bool
	err := db.Pool.QueryRow(ctx,
		`SELECT owner_user_id, mode, is_open_for_public FROM books WHERE id = $1`, bookID,
	).Scan(&ownerUserID, &mode, &isOpen)
	if err != nil {
		http.Error(w, "book not found", http.StatusNotFound)
		return nil, false
	}

	isOwnerOrCollab := false
	if ownerUserID != nil && *ownerUserID == userID {
		isOwnerOrCollab = true
	} else if mode == "collab" && userID != "" {
		var exists bool
		_ = db.Pool.QueryRow(ctx, `
			SELECT EXISTS(SELECT 1 FROM book_collaborators WHERE book_id = $1 AND user_id = $2 AND status = 'active')
		`, bookID, userID).Scan(&exists)
		isOwnerOrCollab = exists
	}

	return &bookAccess{OwnerUserID: ownerUserID, Mode: mode, IsOpenForPublic: isOpen, IsOwnerOrCollab: isOwnerOrCollab}, true
}

// CreateSentence handles POST /api/sentences (auth required).
// Owners/collaborators may post to their own book at any time. Everyone else may post
// only if the book owner has enabled "open for public" — and even then, just once every 24h.
func CreateSentence(w http.ResponseWriter, r *http.Request) {
	identity := auth.FromContext(r.Context())
	if identity == nil {
		http.Error(w, "sign in required", http.StatusUnauthorized)
		return
	}

	var req createSentenceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	req.Content = strings.TrimSpace(req.Content)
	if req.Content == "" {
		http.Error(w, "content is required", http.StatusBadRequest)
		return
	}
	if len(req.Content) > maxSentenceLength {
		http.Error(w, "sentence exceeds 280 characters", http.StatusBadRequest)
		return
	}
	if req.BookID == "" {
		req.BookID = defaultBookID
	}

	ctx := r.Context()
	access, ok := loadBookAccess(w, r, req.BookID, identity.UserID)
	if !ok {
		return
	}

	if !access.IsOwnerOrCollab {
		if !access.IsOpenForPublic {
			http.Error(w, "this book is not open for public contributions", http.StatusForbidden)
			return
		}
		allowed, retryAfterSec, err := db.CanPostSentence(ctx, req.BookID, identity.UserID)
		if err != nil {
			http.Error(w, "rate limiter unavailable", http.StatusInternalServerError)
			return
		}
		if !allowed {
			w.Header().Set("Retry-After", strconv.FormatInt(retryAfterSec, 10))
			http.Error(w, "you can only submit one sentence to this book every 24 hours", http.StatusTooManyRequests)
			return
		}
	}

	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	var nextSeq int64
	if err := tx.QueryRow(ctx,
		`SELECT COALESCE(MAX(sequence_order), 0) + 1 FROM sentences WHERE book_id = $1`,
		req.BookID,
	).Scan(&nextSeq); err != nil {
		http.Error(w, "failed to determine sequence order", http.StatusInternalServerError)
		return
	}

	id := uuid.New().String()
	authorName := identity.Name
	if authorName == "" {
		authorName = identity.Email
	}

	var createdAt time.Time
	if err := tx.QueryRow(ctx, `
		INSERT INTO sentences (id, book_id, sequence_order, content, author_user_id, author_name, status)
		VALUES ($1, $2, $3, $4, $5, $6, 'visible')
		RETURNING created_at
	`, id, req.BookID, nextSeq, req.Content, identity.UserID, authorName).Scan(&createdAt); err != nil {
		http.Error(w, "failed to insert sentence", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		http.Error(w, "failed to commit transaction", http.StatusInternalServerError)
		return
	}

	if !access.IsOwnerOrCollab {
		_ = db.MarkSentencePosted(ctx, req.BookID, identity.UserID)
	}

	sentence := Sentence{
		ID: id, BookID: req.BookID, SequenceOrder: nextSeq, Content: req.Content,
		AuthorUserID: identity.UserID, AuthorName: authorName, Status: "visible", CreatedAt: createdAt,
	}

	GlobalHub.Broadcast(req.BookID, SSEEvent{Type: "sentence.created", Data: sentence})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(sentence)
}

// ListSentences handles GET /api/sentences?book_id=... (public — no auth required).
func ListSentences(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	bookID := r.URL.Query().Get("book_id")
	if bookID == "" {
		bookID = defaultBookID
	}

	fp := clientFingerprint(r)
	_ = db.RecordActiveReader(ctx, bookID, fp)

	rows, err := db.Pool.Query(ctx, `
		SELECT id, book_id, sequence_order, content, author_user_id, author_name, status, flag_count, created_at
		FROM sentences
		WHERE book_id = $1 AND status != 'deleted'
		ORDER BY sequence_order ASC
	`, bookID)
	if err != nil {
		http.Error(w, "failed to load sentences", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	sentences := make([]Sentence, 0)
	for rows.Next() {
		var s Sentence
		var authorName *string
		if err := rows.Scan(&s.ID, &s.BookID, &s.SequenceOrder, &s.Content, &s.AuthorUserID, &authorName, &s.Status, &s.FlagCount, &s.CreatedAt); err != nil {
			http.Error(w, "failed to scan sentence", http.StatusInternalServerError)
			return
		}
		if authorName != nil {
			s.AuthorName = *authorName
		}
		if s.Status == "soft_hidden" {
			s.Content = "[Soft-hidden by community - Click to reveal]"
		}
		sentences = append(sentences, s)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sentences)
}

// RevealSoftHidden handles GET /api/sentences/{id}/reveal (public).
func RevealSoftHidden(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := chi.URLParam(r, "id")

	var content, status string
	err := db.Pool.QueryRow(ctx,
		`SELECT content, status FROM sentences WHERE id = $1`, id,
	).Scan(&content, &status)
	if err != nil {
		http.Error(w, "sentence not found", http.StatusNotFound)
		return
	}
	if status == "deleted" {
		http.Error(w, "this sentence has been removed", http.StatusGone)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"content": content})
}

// FlagSentence handles POST /api/sentences/{id}/flag (auth required — one flag per identity).
func FlagSentence(w http.ResponseWriter, r *http.Request) {
	identity := auth.FromContext(r.Context())
	if identity == nil {
		http.Error(w, "sign in required", http.StatusUnauthorized)
		return
	}

	ctx := r.Context()
	id := chi.URLParam(r, "id")

	var bookID string
	if err := db.Pool.QueryRow(ctx, `SELECT book_id FROM sentences WHERE id = $1`, id).Scan(&bookID); err != nil {
		http.Error(w, "sentence not found", http.StatusNotFound)
		return
	}

	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO sentence_flags (sentence_id, voter_user_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`, id, identity.UserID)
	if err != nil {
		http.Error(w, "failed to record flag", http.StatusInternalServerError)
		return
	}

	var flagCount int
	if err := tx.QueryRow(ctx,
		`UPDATE sentences SET flag_count = (SELECT COUNT(*) FROM sentence_flags WHERE sentence_id = $1)
		 WHERE id = $1 RETURNING flag_count`, id,
	).Scan(&flagCount); err != nil {
		http.Error(w, "failed to update flag count", http.StatusInternalServerError)
		return
	}

	activeReaders, err := db.ActiveReaderCount(ctx, bookID)
	if err != nil {
		activeReaders = 0
	}
	threshold := db.FlagThreshold(activeReaders)

	newStatus := "visible"
	if flagCount >= int(threshold) {
		newStatus = "deleted"
	} else if int64(flagCount)*2 >= threshold {
		newStatus = "soft_hidden"
	}

	if _, err := tx.Exec(ctx, `UPDATE sentences SET status = $1 WHERE id = $2`, newStatus, id); err != nil {
		http.Error(w, "failed to update status", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		http.Error(w, "failed to commit transaction", http.StatusInternalServerError)
		return
	}

	GlobalHub.Broadcast(bookID, SSEEvent{Type: "sentence.moderated", Data: map[string]interface{}{
		"id": id, "status": newStatus, "flag_count": flagCount, "threshold": threshold,
	}})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id": id, "status": newStatus, "flag_count": flagCount, "threshold": threshold,
	})
}
