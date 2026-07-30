package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"one-world-sentence/backend/auth"
	"one-world-sentence/backend/db"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Book struct {
	ID              string    `json:"id"`
	Title           string    `json:"title"`
	Genre           string    `json:"genre"`
	Description     string    `json:"description,omitempty"`
	IsGlobal        bool      `json:"is_global"`
	OwnerUserID     *string   `json:"owner_user_id,omitempty"`
	OwnerName       *string   `json:"owner_name,omitempty"`
	Mode            string    `json:"mode"` // solo | collab
	IsOpenForPublic bool      `json:"is_open_for_public"`
	IsOwner         bool      `json:"is_owner"`
	IsCollaborator  bool      `json:"is_collaborator"`
	CreatedAt       time.Time `json:"created_at"`
}

func scanBook(row interface {
	Scan(dest ...interface{}) error
}) (Book, error) {
	var b Book
	err := row.Scan(&b.ID, &b.Title, &b.Genre, &b.Description, &b.IsGlobal, &b.OwnerUserID, &b.OwnerName, &b.Mode, &b.IsOpenForPublic, &b.CreatedAt)
	return b, err
}

// ListBooks handles GET /api/books — the global story plus every genre room, with the
// caller's ownership/collaboration status attached if they're signed in.
func ListBooks(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	identity := auth.FromContext(ctx)

	rows, err := db.Pool.Query(ctx, `
		SELECT id, title, genre, COALESCE(description, ''), is_global, owner_user_id, owner_name, mode, is_open_for_public, created_at
		FROM books
		ORDER BY created_at ASC
	`)
	if err != nil {
		http.Error(w, "failed to load books", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	books := make([]Book, 0)
	for rows.Next() {
		b, err := scanBook(rows)
		if err != nil {
			http.Error(w, "failed to scan book", http.StatusInternalServerError)
			return
		}
		attachAccessFlags(ctx, &b, identity)
		books = append(books, b)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(books)
}

// GetBook handles GET /api/books/{id} — used by the reader page to know whether to
// show the sentence composer, and whether to show owner-only settings.
func GetBook(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	identity := auth.FromContext(ctx)
	id := chi.URLParam(r, "id")

	row := db.Pool.QueryRow(ctx, `
		SELECT id, title, genre, COALESCE(description, ''), is_global, owner_user_id, owner_name, mode, is_open_for_public, created_at
		FROM books WHERE id = $1
	`, id)
	b, err := scanBook(row)
	if err != nil {
		http.Error(w, "book not found", http.StatusNotFound)
		return
	}
	attachAccessFlags(ctx, &b, identity)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(b)
}

func attachAccessFlags(ctx context.Context, b *Book, identity *auth.Identity) {
	if identity == nil {
		return
	}
	if b.OwnerUserID != nil && *b.OwnerUserID == identity.UserID {
		b.IsOwner = true
		return
	}
	if b.Mode == "collab" {
		var exists bool
		_ = db.Pool.QueryRow(ctx, `
			SELECT EXISTS(SELECT 1 FROM book_collaborators WHERE book_id = $1 AND user_id = $2 AND status = 'active')
		`, b.ID, identity.UserID).Scan(&exists)
		b.IsCollaborator = exists
	}
}

// ListMyBooks handles GET /api/books/mine (auth required) — books the caller owns or
// actively collaborates on, i.e. "userlar o'zlarini kitoblarini yozishlari" / co-op books.
func ListMyBooks(w http.ResponseWriter, r *http.Request) {
	identity := auth.FromContext(r.Context())
	if identity == nil {
		http.Error(w, "sign in required", http.StatusUnauthorized)
		return
	}
	ctx := r.Context()

	rows, err := db.Pool.Query(ctx, `
		SELECT DISTINCT b.id, b.title, b.genre, COALESCE(b.description, ''), b.is_global,
		       b.owner_user_id, b.owner_name, b.mode, b.is_open_for_public, b.created_at
		FROM books b
		LEFT JOIN book_collaborators c ON c.book_id = b.id AND c.user_id = $1 AND c.status = 'active'
		WHERE b.owner_user_id = $1 OR c.user_id = $1
		ORDER BY b.created_at DESC
	`, identity.UserID)
	if err != nil {
		http.Error(w, "failed to load your books", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	books := make([]Book, 0)
	for rows.Next() {
		b, err := scanBook(rows)
		if err != nil {
			http.Error(w, "failed to scan book", http.StatusInternalServerError)
			return
		}
		attachAccessFlags(ctx, &b, identity)
		books = append(books, b)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(books)
}

type createBookRequest struct {
	Title           string `json:"title"`
	Genre           string `json:"genre"`
	Description     string `json:"description,omitempty"`
	Mode            string `json:"mode"` // "solo" | "collab"
	IsOpenForPublic bool   `json:"is_open_for_public"`
}

// CreateBook handles POST /api/books (auth required) — a user writing their own book,
// solo or as a collaborative co-op room.
func CreateBook(w http.ResponseWriter, r *http.Request) {
	identity := auth.FromContext(r.Context())
	if identity == nil {
		http.Error(w, "sign in required", http.StatusUnauthorized)
		return
	}

	var req createBookRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		http.Error(w, "title is required", http.StatusBadRequest)
		return
	}
	if req.Genre == "" {
		req.Genre = "general"
	}
	if req.Mode != "collab" {
		req.Mode = "solo"
	}

	ctx := r.Context()
	id := uuid.New().String()
	ownerName := identity.Name
	if ownerName == "" {
		ownerName = identity.Email
	}

	var createdAt time.Time
	err := db.Pool.QueryRow(ctx, `
		INSERT INTO books (id, title, genre, description, is_global, owner_user_id, owner_name, mode, is_open_for_public)
		VALUES ($1, $2, $3, $4, false, $5, $6, $7, $8)
		RETURNING created_at
	`, id, req.Title, req.Genre, req.Description, identity.UserID, ownerName, req.Mode, req.IsOpenForPublic).Scan(&createdAt)
	if err != nil {
		http.Error(w, "failed to create book", http.StatusInternalServerError)
		return
	}

	book := Book{
		ID: id, Title: req.Title, Genre: req.Genre, Description: req.Description,
		OwnerUserID: &identity.UserID, OwnerName: &ownerName, Mode: req.Mode,
		IsOpenForPublic: req.IsOpenForPublic, IsOwner: true, CreatedAt: createdAt,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(book)
}

type updateBookRequest struct {
	Title           *string `json:"title,omitempty"`
	Description     *string `json:"description,omitempty"`
	Mode            *string `json:"mode,omitempty"`
	IsOpenForPublic *bool   `json:"is_open_for_public,omitempty"`
}

// UpdateBook handles PATCH /api/books/{id} (owner only) — e.g. toggling "open for public".
func UpdateBook(w http.ResponseWriter, r *http.Request) {
	identity := auth.FromContext(r.Context())
	if identity == nil {
		http.Error(w, "sign in required", http.StatusUnauthorized)
		return
	}
	id := chi.URLParam(r, "id")
	ctx := r.Context()

	var ownerUserID *string
	if err := db.Pool.QueryRow(ctx, `SELECT owner_user_id FROM books WHERE id = $1`, id).Scan(&ownerUserID); err != nil {
		http.Error(w, "book not found", http.StatusNotFound)
		return
	}
	if ownerUserID == nil || *ownerUserID != identity.UserID {
		http.Error(w, "only the book owner can change these settings", http.StatusForbidden)
		return
	}

	var req updateBookRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	_, err := db.Pool.Exec(ctx, `
		UPDATE books SET
			title = COALESCE($1, title),
			description = COALESCE($2, description),
			mode = COALESCE($3, mode),
			is_open_for_public = COALESCE($4, is_open_for_public)
		WHERE id = $5
	`, req.Title, req.Description, req.Mode, req.IsOpenForPublic, id)
	if err != nil {
		http.Error(w, "failed to update book", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

type collaborator struct {
	ID           string  `json:"id"`
	InvitedEmail string  `json:"invited_email"`
	UserName     *string `json:"user_name,omitempty"`
	Status       string  `json:"status"`
	CreatedAt    string  `json:"created_at"`
}

// ListCollaborators handles GET /api/books/{id}/collaborators (owner only).
func ListCollaborators(w http.ResponseWriter, r *http.Request) {
	identity := auth.FromContext(r.Context())
	if identity == nil {
		http.Error(w, "sign in required", http.StatusUnauthorized)
		return
	}
	bookID := chi.URLParam(r, "id")
	ctx := r.Context()

	var ownerUserID *string
	if err := db.Pool.QueryRow(ctx, `SELECT owner_user_id FROM books WHERE id = $1`, bookID).Scan(&ownerUserID); err != nil {
		http.Error(w, "book not found", http.StatusNotFound)
		return
	}
	if ownerUserID == nil || *ownerUserID != identity.UserID {
		http.Error(w, "only the book owner can view collaborators", http.StatusForbidden)
		return
	}

	rows, err := db.Pool.Query(ctx, `
		SELECT id, invited_email, user_name, status, created_at
		FROM book_collaborators WHERE book_id = $1 ORDER BY created_at ASC
	`, bookID)
	if err != nil {
		http.Error(w, "failed to load collaborators", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	collaborators := make([]collaborator, 0)
	for rows.Next() {
		var c collaborator
		var createdAt time.Time
		if err := rows.Scan(&c.ID, &c.InvitedEmail, &c.UserName, &c.Status, &createdAt); err != nil {
			http.Error(w, "failed to scan collaborator", http.StatusInternalServerError)
			return
		}
		c.CreatedAt = createdAt.Format(time.RFC3339)
		collaborators = append(collaborators, c)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(collaborators)
}

type inviteCollaboratorRequest struct {
	Email string `json:"email"`
}

// InviteCollaborator handles POST /api/books/{id}/collaborators (owner only).
// The invite activates automatically the first time that email address signs in.
func InviteCollaborator(w http.ResponseWriter, r *http.Request) {
	identity := auth.FromContext(r.Context())
	if identity == nil {
		http.Error(w, "sign in required", http.StatusUnauthorized)
		return
	}
	bookID := chi.URLParam(r, "id")
	ctx := r.Context()

	var ownerUserID *string
	var mode string
	if err := db.Pool.QueryRow(ctx, `SELECT owner_user_id, mode FROM books WHERE id = $1`, bookID).Scan(&ownerUserID, &mode); err != nil {
		http.Error(w, "book not found", http.StatusNotFound)
		return
	}
	if ownerUserID == nil || *ownerUserID != identity.UserID {
		http.Error(w, "only the book owner can invite collaborators", http.StatusForbidden)
		return
	}
	if mode != "collab" {
		http.Error(w, "switch this book to collaborative mode before inviting collaborators", http.StatusBadRequest)
		return
	}

	var req inviteCollaboratorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" {
		http.Error(w, "email is required", http.StatusBadRequest)
		return
	}

	// If the invited email already has an active session/user record from a prior sign-in,
	// SyncCollaboratorInvites (run on their next request) will pick it up; here we just
	// record the invite as pending.
	_, err := db.Pool.Exec(ctx, `
		INSERT INTO book_collaborators (book_id, invited_email, status)
		VALUES ($1, $2, 'pending')
		ON CONFLICT (book_id, invited_email) DO NOTHING
	`, bookID, email)
	if err != nil {
		http.Error(w, "failed to invite collaborator", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

// RemoveCollaborator handles DELETE /api/books/{id}/collaborators/{collaboratorId} (owner only).
func RemoveCollaborator(w http.ResponseWriter, r *http.Request) {
	identity := auth.FromContext(r.Context())
	if identity == nil {
		http.Error(w, "sign in required", http.StatusUnauthorized)
		return
	}
	bookID := chi.URLParam(r, "id")
	collabID := chi.URLParam(r, "collaboratorId")
	ctx := r.Context()

	var ownerUserID *string
	if err := db.Pool.QueryRow(ctx, `SELECT owner_user_id FROM books WHERE id = $1`, bookID).Scan(&ownerUserID); err != nil {
		http.Error(w, "book not found", http.StatusNotFound)
		return
	}
	if ownerUserID == nil || *ownerUserID != identity.UserID {
		http.Error(w, "only the book owner can remove collaborators", http.StatusForbidden)
		return
	}

	if _, err := db.Pool.Exec(ctx, `DELETE FROM book_collaborators WHERE id = $1 AND book_id = $2`, collabID, bookID); err != nil {
		http.Error(w, "failed to remove collaborator", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ToggleBookmark handles POST /api/books/{id}/bookmark (auth required).
func ToggleBookmark(w http.ResponseWriter, r *http.Request) {
	identity := auth.FromContext(r.Context())
	if identity == nil {
		http.Error(w, "sign in required", http.StatusUnauthorized)
		return
	}
	bookID := chi.URLParam(r, "id")
	ctx := r.Context()

	var exists bool
	err := db.Pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM bookmarks WHERE user_id = $1 AND book_id = $2)`,
		identity.UserID, bookID,
	).Scan(&exists)
	if err != nil {
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	if exists {
		_, err = db.Pool.Exec(ctx, `DELETE FROM bookmarks WHERE user_id = $1 AND book_id = $2`, identity.UserID, bookID)
	} else {
		_, err = db.Pool.Exec(ctx, `INSERT INTO bookmarks (user_id, book_id) VALUES ($1, $2)`, identity.UserID, bookID)
	}
	if err != nil {
		http.Error(w, "failed to toggle bookmark", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"bookmarked": !exists})
}

// ListMyBookmarks handles GET /api/books/bookmarked (auth required) — the personal bookshelf.
func ListMyBookmarks(w http.ResponseWriter, r *http.Request) {
	identity := auth.FromContext(r.Context())
	if identity == nil {
		http.Error(w, "sign in required", http.StatusUnauthorized)
		return
	}
	ctx := r.Context()

	rows, err := db.Pool.Query(ctx, `
		SELECT b.id, b.title, b.genre, COALESCE(b.description, ''), b.is_global,
		       b.owner_user_id, b.owner_name, b.mode, b.is_open_for_public, b.created_at
		FROM bookmarks bm
		JOIN books b ON b.id = bm.book_id
		WHERE bm.user_id = $1
		ORDER BY bm.created_at DESC
	`, identity.UserID)
	if err != nil {
		http.Error(w, "failed to load bookshelf", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	books := make([]Book, 0)
	for rows.Next() {
		b, err := scanBook(rows)
		if err != nil {
			http.Error(w, "failed to scan book", http.StatusInternalServerError)
			return
		}
		attachAccessFlags(ctx, &b, identity)
		books = append(books, b)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(books)
}

// ListUserSentences handles GET /api/users/{id}/sentences — a user's submitted sentence history.
func ListUserSentences(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	ctx := r.Context()

	rows, err := db.Pool.Query(ctx, `
		SELECT id, book_id, sequence_order, content, author_user_id, author_name, status, flag_count, created_at
		FROM sentences
		WHERE author_user_id = $1
		ORDER BY created_at DESC
	`, userID)
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
		sentences = append(sentences, s)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sentences)
}
