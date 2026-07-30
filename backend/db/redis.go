package db

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
)

var RDB *redis.Client

const (
	rateLimitWindow = 24 * time.Hour
)

// HashFingerprint combines IP + User-Agent into a stable, non-reversible identifier.
// Reading the story requires no login, so anonymous readers are still counted towards
// the dynamic flag threshold using this fingerprint.
func HashFingerprint(ip, userAgent string) string {
	sum := sha256.Sum256([]byte(ip + "|" + userAgent))
	return hex.EncodeToString(sum[:])
}

// ConnectRedis initializes the Upstash Redis client used for:
//  1. the 24h-per-user / per-fingerprint sentence rate limiter
//  2. caching the "active daily readers" counter used by the dynamic flag threshold
func ConnectRedis() error {
	addr := os.Getenv("UPSTASH_REDIS_URL") // e.g. rediss://default:<password>@<host>:<port>
	if addr == "" {
		return fmt.Errorf("UPSTASH_REDIS_URL environment variable is not set")
	}

	opt, err := redis.ParseURL(addr)
	if err != nil {
		return fmt.Errorf("failed to parse UPSTASH_REDIS_URL: %w", err)
	}

	RDB = redis.NewClient(opt)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := RDB.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("failed to ping redis: %w", err)
	}
	return nil
}

// rateLimitKey builds the Redis key for a user's 24h cooldown on a specific book.
func rateLimitKey(bookID, userID string) string {
	return "ratelimit:book:" + bookID + ":user:" + userID
}

// CanPostSentence checks (without consuming) whether userID may post to bookID right now.
// Returns (allowed, secondsUntilNextAllowed).
func CanPostSentence(ctx context.Context, bookID, userID string) (bool, int64, error) {
	key := rateLimitKey(bookID, userID)
	ttl, err := RDB.TTL(ctx, key).Result()
	if err != nil {
		return false, 0, err
	}
	if ttl <= 0 {
		return true, 0, nil
	}
	return false, int64(ttl.Seconds()), nil
}

// MarkSentencePosted sets the 24h TTL key that blocks the user's next submission to this book.
func MarkSentencePosted(ctx context.Context, bookID, userID string) error {
	key := rateLimitKey(bookID, userID)
	return RDB.Set(ctx, key, time.Now().Unix(), rateLimitWindow).Err()
}

// RecordActiveReader adds a reader fingerprint to today's active-reader set for a book.
// Used to compute the dynamic flag threshold: MAX(5, 15% of active daily readers).
func RecordActiveReader(ctx context.Context, bookID, readerHash string) error {
	day := time.Now().UTC().Format("2006-01-02")
	key := fmt.Sprintf("readers:%s:%s", bookID, day)
	if err := RDB.SAdd(ctx, key, readerHash).Err(); err != nil {
		return err
	}
	// Expire the daily set after 48h so Redis memory stays bounded on the free tier.
	return RDB.Expire(ctx, key, 48*time.Hour).Err()
}

// ActiveReaderCount returns today's distinct active reader count for a book.
func ActiveReaderCount(ctx context.Context, bookID string) (int64, error) {
	day := time.Now().UTC().Format("2006-01-02")
	key := fmt.Sprintf("readers:%s:%s", bookID, day)
	return RDB.SCard(ctx, key).Result()
}

// FlagThreshold implements: MAX(5, 15% of active daily readers).
func FlagThreshold(activeReaders int64) int64 {
	dynamic := int64(float64(activeReaders) * 0.15)
	if dynamic < 5 {
		return 5
	}
	return dynamic
}
