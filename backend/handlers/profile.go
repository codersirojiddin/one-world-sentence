package handlers

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"one-world-sentence/backend/auth"
	"one-world-sentence/backend/db"

	"github.com/go-chi/chi/v5"
)

const usernameChangeCooldown = 15 * 24 * time.Hour

var usernamePattern = regexp.MustCompile(`^[a-z0-9_]{3,20}$`)

type Profile struct {
	Username          string     `json:"username"`
	DisplayName       string     `json:"display_name,omitempty"`
	Bio               string     `json:"bio,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
	UsernameChangedAt *time.Time `json:"username_changed_at,omitempty"`
	SentenceCount     int        `json:"sentence_count"`
}

func validateUsername(u string) (string, bool) {
	u = strings.ToLower(strings.TrimSpace(u))
	return u, usernamePattern.MatchString(u)
}

// GetMyProfile handles GET /api/profiles/me (auth required).
func GetMyProfile(w http.ResponseWriter, r *http.Request) {
	identity := auth.FromContext(r.Context())
	if identity == nil {
		http.Error(w, "sign in required", http.StatusUnauthorized)
		return
	}
	ctx := r.Context()

	var p Profile
	err := db.Pool.QueryRow(ctx, `
		SELECT username, COALESCE(display_name, ''), COALESCE(bio, ''), created_at, username_changed_at
		FROM profiles WHERE user_id = $1
	`, identity.UserID).Scan(&p.Username, &p.DisplayName, &p.Bio, &p.CreatedAt, &p.UsernameChangedAt)
	if err != nil {
		// No profile yet — not an error, the frontend prompts the user to choose a username.
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"exists": false})
		return
	}

	_ = db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM sentences WHERE author_user_id = $1 AND status != 'deleted'`,
		identity.UserID).Scan(&p.SentenceCount)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"exists": true, "profile": p})
}

// GetPublicProfile handles GET /api/profiles/{username} (public).
func GetPublicProfile(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	username, ok := validateUsername(chi.URLParam(r, "username"))
	if !ok {
		http.Error(w, "invalid username", http.StatusBadRequest)
		return
	}

	var p Profile
	var userID string
	err := db.Pool.QueryRow(ctx, `
		SELECT user_id, username, COALESCE(display_name, ''), COALESCE(bio, ''), created_at
		FROM profiles WHERE lower(username) = $1
	`, username).Scan(&userID, &p.Username, &p.DisplayName, &p.Bio, &p.CreatedAt)
	if err != nil {
		http.Error(w, "profile not found", http.StatusNotFound)
		return
	}
	_ = db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM sentences WHERE author_user_id = $1 AND status != 'deleted'`,
		userID).Scan(&p.SentenceCount)

	rows, err := db.Pool.Query(ctx, `
		SELECT DISTINCT `+bookSelectColumns+`
		FROM books b
		LEFT JOIN profiles p ON p.user_id = b.owner_user_id
		LEFT JOIN book_collaborators c ON c.book_id = b.id AND c.user_id = $1 AND c.status = 'active'
		WHERE b.owner_user_id = $1 OR c.user_id = $1
		ORDER BY b.created_at DESC
	`, userID)
	books := make([]Book, 0)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			b, err := scanBook(rows)
			if err == nil {
				books = append(books, b)
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"profile": p, "books": books})
}

type updateProfileRequest struct {
	Username    *string `json:"username,omitempty"`
	DisplayName *string `json:"display_name,omitempty"`
	Bio         *string `json:"bio,omitempty"`
}

// UpdateMyProfile handles PUT /api/profiles/me (auth required).
// Creates the profile on first use; enforces the username format, uniqueness, and the
// 15-day change cooldown once a username has already been set.
func UpdateMyProfile(w http.ResponseWriter, r *http.Request) {
	identity := auth.FromContext(r.Context())
	if identity == nil {
		http.Error(w, "sign in required", http.StatusUnauthorized)
		return
	}
	ctx := r.Context()

	var req updateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	var existingUsername string
	var usernameChangedAt *time.Time
	hasProfile := true
	err := db.Pool.QueryRow(ctx, `SELECT username, username_changed_at FROM profiles WHERE user_id = $1`,
		identity.UserID).Scan(&existingUsername, &usernameChangedAt)
	if err != nil {
		hasProfile = false
	}

	newUsername := existingUsername
	usernameChanging := false
	if req.Username != nil {
		u, ok := validateUsername(*req.Username)
		if !ok {
			http.Error(w, "username must be 3-20 characters: lowercase letters, numbers, underscore only", http.StatusBadRequest)
			return
		}
		if u != strings.ToLower(existingUsername) {
			usernameChanging = true
			if hasProfile && usernameChangedAt != nil && time.Since(*usernameChangedAt) < usernameChangeCooldown {
				nextAllowed := usernameChangedAt.Add(usernameChangeCooldown)
				http.Error(w, "you can only change your username once every 15 days; next change available "+nextAllowed.Format(time.RFC3339), http.StatusTooManyRequests)
				return
			}
		}
		newUsername = u
	} else if !hasProfile {
		http.Error(w, "username is required to create a profile", http.StatusBadRequest)
		return
	}

	displayName := ""
	bio := ""
	if req.DisplayName != nil {
		displayName = strings.TrimSpace(*req.DisplayName)
	}
	if req.Bio != nil {
		bio = strings.TrimSpace(*req.Bio)
		if len(bio) > 280 {
			http.Error(w, "bio must be 280 characters or fewer", http.StatusBadRequest)
			return
		}
	}

	if usernameChanging || !hasProfile {
		var taken bool
		_ = db.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM profiles WHERE lower(username) = $1 AND user_id != $2)`,
			newUsername, identity.UserID).Scan(&taken)
		if taken {
			http.Error(w, "that username is already taken", http.StatusConflict)
			return
		}
	}

	if hasProfile {
		if usernameChanging {
			_, err = db.Pool.Exec(ctx, `
				UPDATE profiles SET username = $1, display_name = COALESCE(NULLIF($2, ''), display_name),
				       bio = $3, username_changed_at = now(), email = COALESCE(NULLIF($5, ''), email)
				WHERE user_id = $4
			`, newUsername, displayName, bio, identity.UserID, identity.Email)
		} else {
			_, err = db.Pool.Exec(ctx, `
				UPDATE profiles SET display_name = COALESCE(NULLIF($1, ''), display_name), bio = $2,
				       email = COALESCE(NULLIF($4, ''), email)
				WHERE user_id = $3
			`, displayName, bio, identity.UserID, identity.Email)
		}
	} else {
		if displayName == "" {
			displayName = identity.Name
		}
		_, err = db.Pool.Exec(ctx, `
			INSERT INTO profiles (user_id, username, display_name, bio, username_changed_at, email)
			VALUES ($1, $2, $3, $4, now(), $5)
		`, identity.UserID, newUsername, displayName, bio, identity.Email)
	}
	if err != nil {
		http.Error(w, "failed to save profile (username may already be taken)", http.StatusConflict)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// CheckUsernameAvailable handles GET /api/profiles/check?username=... for live validation.
func CheckUsernameAvailable(w http.ResponseWriter, r *http.Request) {
	identity := auth.FromContext(r.Context())
	u, ok := validateUsername(r.URL.Query().Get("username"))
	if !ok {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"available": false, "reason": "invalid_format"})
		return
	}

	ctx := r.Context()
	var taken bool
	excludeUserID := ""
	if identity != nil {
		excludeUserID = identity.UserID
	}
	_ = db.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM profiles WHERE lower(username) = $1 AND user_id != $2)`,
		u, excludeUserID).Scan(&taken)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"available": !taken})
}
