// Hybrid fanout + hotkey salting reference service (Go).
// Mirrors the canonical contract: GET /api/feed/hybrid?userId= and
// GET /api/feed/hybrid/route?authorId=. Postgres stores authors/posts,
// Redis caches the KOL timeline under a salted key to mitigate hotkeys.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// Author is a feed author; isCelebrity drives the routing decision.
type Author struct {
	ID          string `json:"id"`
	IsCelebrity bool   `json:"isCelebrity"`
}

// Post is a single timeline row persisted in Postgres.
type Post struct {
	ID        string `json:"id"`
	AuthorID  string `json:"authorId"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
}

var (
	pool  *pgxpool.Pool
	rdb   *redis.Client
	ctxBg = context.Background()
)

// env reads an environment variable with a fallback default.
func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// getSaltedKolKey spreads the KOL hotkey across 4 salt slots using the
// last character code of the userId, so one Redis key never absorbs all reads.
func getSaltedKolKey(authorID, userID string) string {
	salt := 0
	if len(userID) > 0 {
		salt = int(userID[len(userID)-1]) % 4
	}
	return fmt.Sprintf("feed:kol:%s:salt:%d", authorID, salt)
}

// initSchema creates tables and seeds demo rows when the posts table is empty.
func initSchema() error {
	_, err := pool.Exec(ctxBg, `
		CREATE TABLE IF NOT EXISTS authors (
			id TEXT PRIMARY KEY,
			"isCelebrity" BOOLEAN NOT NULL DEFAULT false
		);
		CREATE TABLE IF NOT EXISTS posts (
			id TEXT PRIMARY KEY,
			"authorId" TEXT NOT NULL,
			content TEXT NOT NULL,
			"createdAt" TEXT NOT NULL
		);`)
	if err != nil {
		return err
	}
	var count int
	if err := pool.QueryRow(ctxBg, `SELECT COUNT(*) FROM posts`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	_, err = pool.Exec(ctxBg, `
		INSERT INTO authors (id, "isCelebrity") VALUES
			('author_1', false), ('kol_1', true);
		INSERT INTO posts (id, "authorId", content, "createdAt") VALUES
			('post_201', 'author_1', 'Regular author post was pushed into the user feed.', '2026-05-20T08:30:00.000Z'),
			('post_301', 'kol_1', 'KOL post is pulled and merged at read time.', '2026-05-20T09:30:00.000Z');`)
	return err
}

// getHybridFeed merges the push (regular) timeline with the KOL pull timeline,
// caches the KOL posts under a salted key (EX 60), and sorts by createdAt DESC.
func getHybridFeed(userID string) (map[string]any, error) {
	rows, err := pool.Query(ctxBg, `SELECT id, "isCelebrity" FROM authors`)
	if err != nil {
		return nil, err
	}
	celebritySet := map[string]bool{}
	celebrityIDs := []string{}
	for rows.Next() {
		var a Author
		if err := rows.Scan(&a.ID, &a.IsCelebrity); err != nil {
			rows.Close()
			return nil, err
		}
		if a.IsCelebrity {
			celebritySet[a.ID] = true
			celebrityIDs = append(celebrityIDs, a.ID)
		}
	}
	rows.Close()

	postRows, err := pool.Query(ctxBg, `SELECT id, "authorId", content, "createdAt" FROM posts`)
	if err != nil {
		return nil, err
	}
	pushed := []Post{}
	celebrityPosts := []Post{}
	for postRows.Next() {
		var p Post
		if err := postRows.Scan(&p.ID, &p.AuthorID, &p.Content, &p.CreatedAt); err != nil {
			postRows.Close()
			return nil, err
		}
		if celebritySet[p.AuthorID] {
			celebrityPosts = append(celebrityPosts, p)
		} else {
			pushed = append(pushed, p)
		}
	}
	postRows.Close()

	saltedKey := getSaltedKolKey("kol_1", userID)
	payload, _ := json.Marshal(celebrityPosts)
	if err := rdb.Set(ctxBg, saltedKey, payload, 60*time.Second).Err(); err != nil {
		return nil, err
	}

	timeline := append(append([]Post{}, pushed...), celebrityPosts...)
	sort.Slice(timeline, func(i, j int) bool {
		return timeline[i].CreatedAt > timeline[j].CreatedAt
	})
	if celebrityIDs == nil {
		celebrityIDs = []string{}
	}

	return map[string]any{
		"model":  "hybrid-fanout",
		"userId": userID,
		"strategy": map[string]string{
			"regularUsers":   "fanout-on-write",
			"celebrityUsers": "fanout-on-read",
		},
		"hotkeyMitigation": map[string]string{
			"technique": "key-salting",
			"saltedKey": saltedKey,
			"reason":    "KOL post cache is duplicated across salted keys so one Redis key does not absorb all reads.",
		},
		"celebrityAuthors": celebrityIDs,
		"timeline":         timeline,
	}, nil
}

// routePost returns the routing decision for an author: celebrities pull at read
// time (1 write), regular users push to followers (number_of_followers writes).
func routePost(authorID string) (map[string]any, error) {
	var isCelebrity bool
	err := pool.QueryRow(ctxBg, `SELECT "isCelebrity" FROM authors WHERE id = $1`, authorID).Scan(&isCelebrity)
	if err != nil {
		isCelebrity = false
	}
	route := "push-to-followers"
	var expectedWrites any = "number_of_followers"
	if isCelebrity {
		route = "pull-at-read-time"
		expectedWrites = 1
	}
	return map[string]any{
		"authorId":       authorID,
		"isCelebrity":    isCelebrity,
		"route":          route,
		"expectedWrites": expectedWrites,
	}, nil
}

func writeJSON(w http.ResponseWriter, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(body)
}

func main() {
	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
		env("POSTGRES_USER", "postgres"),
		env("POSTGRES_PASSWORD", "postgres"),
		env("POSTGRES_HOST", "db"),
		env("POSTGRES_PORT", "5432"),
		env("POSTGRES_DB", "hybrid_feed_service"),
	)
	var err error
	for i := 0; i < 30; i++ {
		pool, err = pgxpool.New(ctxBg, dsn)
		if err == nil {
			if err = pool.Ping(ctxBg); err == nil {
				break
			}
		}
		log.Printf("waiting for postgres (%d): %v", i, err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatalf("postgres unreachable: %v", err)
	}
	if err := initSchema(); err != nil {
		log.Fatalf("schema init failed: %v", err)
	}

	rdb = redis.NewClient(&redis.Options{
		Addr: fmt.Sprintf("%s:%s", env("REDIS_HOST", "redis"), env("REDIS_PORT", "6379")),
	})

	mux := http.NewServeMux()
	mux.HandleFunc("/api/feed/hybrid/route", func(w http.ResponseWriter, r *http.Request) {
		authorID := r.URL.Query().Get("authorId")
		if authorID == "" {
			authorID = "kol_1"
		}
		body, err := routePost(authorID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, body)
	})
	mux.HandleFunc("/api/feed/hybrid", func(w http.ResponseWriter, r *http.Request) {
		userID := r.URL.Query().Get("userId")
		if userID == "" {
			userID = "usr_1"
		}
		body, err := getHybridFeed(userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, body)
	})
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]string{"status": "ok"})
	})

	port := env("PORT", "3000")
	log.Printf("hybrid-feed-service (go) listening on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}
