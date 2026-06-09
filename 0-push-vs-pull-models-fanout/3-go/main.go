// Push vs pull fanout reference service (Go).
// Mirrors the canonical contract shared by all four language ports:
//   POST /api/feed/post  -> create a post and fanout-on-write into follower timelines
//   GET  /api/feed/pull  -> fanout-on-read: aggregate followed authors' posts at read time
//   GET  /api/feed/push  -> fanout-on-write read: serve the pre-materialized timeline
// Postgres is the single source of truth (Postgres-only, no Redis routing):
// follows / posts / pushed_timeline tables. Redis is present in the stack but
// intentionally unused by these routes (reserved for later fanout experiments).
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Post is a single feed post row persisted in Postgres.
type Post struct {
	ID        string `json:"id"`
	AuthorID  string `json:"authorId"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
}

var (
	pool  *pgxpool.Pool
	ctxBg = context.Background()
)

// env reads an environment variable with a fallback default.
func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// initSchema creates the demo tables and seeds the fanout graph when empty.
func initSchema() error {
	_, err := pool.Exec(ctxBg, `
		CREATE TABLE IF NOT EXISTS follows (
			"userId" TEXT NOT NULL,
			"authorId" TEXT NOT NULL,
			PRIMARY KEY ("userId", "authorId")
		);
		CREATE TABLE IF NOT EXISTS posts (
			id TEXT PRIMARY KEY,
			"authorId" TEXT NOT NULL,
			content TEXT NOT NULL,
			"createdAt" TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS pushed_timeline (
			"userId" TEXT NOT NULL,
			"postId" TEXT NOT NULL,
			"sortOrder" BIGINT NOT NULL DEFAULT 0,
			PRIMARY KEY ("userId", "postId")
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
		INSERT INTO follows ("userId", "authorId") VALUES
			('usr_1', 'author_1'), ('usr_1', 'kol_1'), ('usr_2', 'author_1');
		INSERT INTO posts (id, "authorId", content, "createdAt") VALUES
			('post_1', 'author_1', 'Designing feeds starts with fanout trade-offs.', '2026-05-20T08:00:00.000Z'),
			('post_2', 'kol_1', 'KOL posts are usually pulled at read time.', '2026-05-20T09:00:00.000Z');
		INSERT INTO pushed_timeline ("userId", "postId", "sortOrder") VALUES
			('usr_1', 'post_1', 0), ('usr_2', 'post_1', 0);`)
	return err
}

// getPullFeed implements fanout-on-read: find followed authors, then fetch their
// posts ordered by createdAt DESC. No pre-materialized state is read.
func getPullFeed(userID string) (map[string]any, error) {
	rows, err := pool.Query(ctxBg, `SELECT "authorId" FROM follows WHERE "userId" = $1`, userID)
	if err != nil {
		return nil, err
	}
	followedAuthors := []string{}
	for rows.Next() {
		var a string
		if err := rows.Scan(&a); err != nil {
			rows.Close()
			return nil, err
		}
		followedAuthors = append(followedAuthors, a)
	}
	rows.Close()

	timeline := []Post{}
	if len(followedAuthors) > 0 {
		postRows, err := pool.Query(ctxBg,
			`SELECT id, "authorId", content, "createdAt" FROM posts
			 WHERE "authorId" = ANY($1) ORDER BY "createdAt" DESC`, followedAuthors)
		if err != nil {
			return nil, err
		}
		for postRows.Next() {
			var p Post
			if err := postRows.Scan(&p.ID, &p.AuthorID, &p.Content, &p.CreatedAt); err != nil {
				postRows.Close()
				return nil, err
			}
			timeline = append(timeline, p)
		}
		postRows.Close()
	}

	return map[string]any{
		"model":           "fanout-on-read",
		"userId":          userID,
		"followedAuthors": followedAuthors,
		"readCost":        "Reads join/filter recent posts from followed authors when the user opens feed.",
		"writeCost":       "Post creation is cheap because no follower timelines are pre-written.",
		"timeline":        timeline,
	}, nil
}

// getPushFeed implements fanout-on-write read: read pre-materialized post ids
// from pushed_timeline ordered by sortOrder ASC, then hydrate the post objects.
func getPushFeed(userID string) (map[string]any, error) {
	rows, err := pool.Query(ctxBg,
		`SELECT "postId" FROM pushed_timeline WHERE "userId" = $1 ORDER BY "sortOrder" ASC`, userID)
	if err != nil {
		return nil, err
	}
	postIDs := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		postIDs = append(postIDs, id)
	}
	rows.Close()

	byID := map[string]Post{}
	if len(postIDs) > 0 {
		postRows, err := pool.Query(ctxBg,
			`SELECT id, "authorId", content, "createdAt" FROM posts WHERE id = ANY($1)`, postIDs)
		if err != nil {
			return nil, err
		}
		for postRows.Next() {
			var p Post
			if err := postRows.Scan(&p.ID, &p.AuthorID, &p.Content, &p.CreatedAt); err != nil {
				postRows.Close()
				return nil, err
			}
			byID[p.ID] = p
		}
		postRows.Close()
	}
	timeline := []Post{}
	for _, id := range postIDs {
		if p, ok := byID[id]; ok {
			timeline = append(timeline, p)
		}
	}

	return map[string]any{
		"model":               "fanout-on-write",
		"userId":              userID,
		"materializedPostIds": postIDs,
		"readCost":            "Reads are fast because the user timeline is already materialized.",
		"writeCost":           "Posting is expensive for authors with many followers.",
		"timeline":            timeline,
	}, nil
}

// createPost persists a post then fanout-on-write: one pushed_timeline row per
// follower of the author. fanoutWrites equals the number of follower writes.
func createPost(authorID, content string) (map[string]any, error) {
	var count int
	if err := pool.QueryRow(ctxBg, `SELECT COUNT(*) FROM posts`).Scan(&count); err != nil {
		return nil, err
	}
	post := Post{
		ID:        fmt.Sprintf("post_%d", count+1),
		AuthorID:  authorID,
		Content:   content,
		CreatedAt: time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
	}
	if _, err := pool.Exec(ctxBg,
		`INSERT INTO posts (id, "authorId", content, "createdAt") VALUES ($1, $2, $3, $4)`,
		post.ID, post.AuthorID, post.Content, post.CreatedAt); err != nil {
		return nil, err
	}

	rows, err := pool.Query(ctxBg, `SELECT "userId" FROM follows WHERE "authorId" = $1`, authorID)
	if err != nil {
		return nil, err
	}
	followerIDs := []string{}
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			rows.Close()
			return nil, err
		}
		followerIDs = append(followerIDs, u)
	}
	rows.Close()

	sortOrder := time.Now().UnixMilli()
	for _, followerID := range followerIDs {
		if _, err := pool.Exec(ctxBg,
			`INSERT INTO pushed_timeline ("userId", "postId", "sortOrder") VALUES ($1, $2, $3)
			 ON CONFLICT ("userId", "postId") DO NOTHING`,
			followerID, post.ID, sortOrder); err != nil {
			return nil, err
		}
		sortOrder++
	}

	return map[string]any{
		"model":        "fanout-on-write",
		"post":         post,
		"followerIds":  followerIDs,
		"fanoutWrites": len(followerIDs),
	}, nil
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func main() {
	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
		env("POSTGRES_USER", "postgres"),
		env("POSTGRES_PASSWORD", "postgres"),
		env("POSTGRES_HOST", "db"),
		env("POSTGRES_PORT", "5432"),
		env("POSTGRES_DB", "feed_service"),
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

	mux := http.NewServeMux()
	mux.HandleFunc("/api/feed/post", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var body struct {
			AuthorID string `json:"authorId"`
			Content  string `json:"content"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.AuthorID == "" {
			body.AuthorID = "author_1"
		}
		if body.Content == "" {
			body.Content = "New post from feed-service"
		}
		res, err := createPost(body.AuthorID, body.Content)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusCreated, res)
	})
	mux.HandleFunc("/api/feed/pull", func(w http.ResponseWriter, r *http.Request) {
		userID := r.URL.Query().Get("userId")
		if userID == "" {
			userID = "usr_1"
		}
		res, err := getPullFeed(userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, res)
	})
	mux.HandleFunc("/api/feed/push", func(w http.ResponseWriter, r *http.Request) {
		userID := r.URL.Query().Get("userId")
		if userID == "" {
			userID = "usr_1"
		}
		res, err := getPushFeed(userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, res)
	})
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	port := env("PORT", "3000")
	log.Printf("feed-service (go) listening on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}
