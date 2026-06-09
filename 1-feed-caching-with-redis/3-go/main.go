package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

func main() {
	cfg := loadConfig()
	ctx := context.Background()

	pool := mustConnectPostgres(ctx, cfg.PostgresDSN)
	defer pool.Close()

	rdb := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr})
	defer func() { _ = rdb.Close() }()

	store := &postStore{pool: pool}
	if err := store.initSchemaAndSeed(ctx); err != nil {
		log.Fatalf("seed failed: %v", err)
	}
	service := &feedService{store: store, rdb: rdb}

	mux := http.NewServeMux()

	// POST /api/feed/cache/seed?userId=usr_1 — materialize ZSET from Postgres.
	mux.HandleFunc("POST /api/feed/cache/seed", func(w http.ResponseWriter, r *http.Request) {
		userID := userIDOr(r, "usr_1")
		body, err := service.seedTimeline(r.Context(), userID)
		writeJSON(w, body, err)
	})

	// GET /api/feed/cache?userId=usr_1 — read newest cached items.
	mux.HandleFunc("GET /api/feed/cache", func(w http.ResponseWriter, r *http.Request) {
		userID := userIDOr(r, "usr_1")
		body, err := service.getCachedFeed(r.Context(), userID)
		writeJSON(w, body, err)
	})

	log.Printf("feed-cache-service listening on :%s", cfg.Port)
	if err := http.ListenAndServe("0.0.0.0:"+cfg.Port, mux); err != nil {
		log.Fatal(err)
	}
}

func mustConnectPostgres(ctx context.Context, dsn string) *pgxpool.Pool {
	var pool *pgxpool.Pool
	var err error
	// Retry briefly so the app can start alongside Postgres in Compose.
	for attempt := 0; attempt < 30; attempt++ {
		pool, err = pgxpool.New(ctx, dsn)
		if err == nil && pool.Ping(ctx) == nil {
			return pool
		}
		time.Sleep(2 * time.Second)
	}
	log.Fatalf("cannot connect to postgres: %v", err)
	return nil
}

func userIDOr(r *http.Request, fallback string) string {
	if value := r.URL.Query().Get("userId"); value != "" {
		return value
	}
	return fallback
}

func writeJSON(w http.ResponseWriter, body map[string]any, err error) {
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	_ = json.NewEncoder(w).Encode(body)
}
