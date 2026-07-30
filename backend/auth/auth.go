package auth

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strings"

	"one-world-sentence/backend/db"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

// Identity represents the authenticated Neon Auth user extracted from a verified JWT.
type Identity struct {
	UserID string // JWT "sub" claim
	Email  string
	Name   string
}

type ctxKey string

const identityCtxKey ctxKey = "identity"

var jwks keyfunc.Keyfunc

// Init fetches and caches Neon Auth's JWKS so tokens can be verified locally without
// a network round-trip on every request. NEON_AUTH_JWKS_URL is typically:
//
//	<your Neon Auth base URL>/.well-known/jwks.json
//
// e.g. https://ep-xxxx.neonauth.c-2.us-east-2.aws.neon.build/neondb/auth/.well-known/jwks.json
func Init() error {
	url := os.Getenv("NEON_AUTH_JWKS_URL")
	if url == "" {
		return errors.New("NEON_AUTH_JWKS_URL environment variable is not set")
	}

	k, err := keyfunc.NewDefaultCtx(context.Background(), []string{url})
	if err != nil {
		return err
	}
	jwks = k
	return nil
}

// verify parses and validates a Neon Auth access token, returning the caller's identity.
func verify(tokenString string) (*Identity, error) {
	if jwks == nil {
		return nil, errors.New("auth not initialized")
	}

	token, err := jwt.Parse(tokenString, jwks.Keyfunc, jwt.WithValidMethods([]string{"EdDSA", "RS256", "ES256"}))
	if err != nil || !token.Valid {
		return nil, errors.New("invalid or expired token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("invalid token claims")
	}

	sub, _ := claims["sub"].(string)
	if sub == "" {
		return nil, errors.New("token missing subject")
	}
	email, _ := claims["email"].(string)
	name, _ := claims["name"].(string)

	return &Identity{UserID: sub, Email: email, Name: name}, nil
}

func extractBearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	return ""
}

// Optional attaches the caller's identity to the request context if a valid token is
// present, but lets the request through either way (used for read endpoints where
// anonymous access is allowed, e.g. reading a story).
func Optional(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if tok := extractBearer(r); tok != "" {
			if id, err := verify(tok); err == nil {
				_ = db.SyncCollaboratorInvites(r.Context(), id.UserID, id.Email, id.Name)
				r = r.WithContext(context.WithValue(r.Context(), identityCtxKey, id))
			}
		}
		next.ServeHTTP(w, r)
	})
}

// Required rejects the request with 401 unless a valid Neon Auth token is present.
// Used for write endpoints: posting sentences, creating books, managing collaborators.
func Required(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tok := extractBearer(r)
		if tok == "" {
			http.Error(w, "sign in required", http.StatusUnauthorized)
			return
		}
		id, err := verify(tok)
		if err != nil {
			http.Error(w, "invalid or expired session, please sign in again", http.StatusUnauthorized)
			return
		}
		if err := db.SyncCollaboratorInvites(r.Context(), id.UserID, id.Email, id.Name); err != nil {
			// Non-fatal — collaborator activation can retry on the next request.
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), identityCtxKey, id)))
	})
}

// FromContext returns the authenticated identity, if any (nil for anonymous requests
// that only went through Optional).
func FromContext(ctx context.Context) *Identity {
	id, _ := ctx.Value(identityCtxKey).(*Identity)
	return id
}
