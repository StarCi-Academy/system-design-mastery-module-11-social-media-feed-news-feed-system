package main

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// cachedPost mirrors a source row before ZADD into the Redis ZSET.
type cachedPost struct {
	ID      string
	ScoreMs int64
}

// postStore loads demo posts from Postgres and seeds them when empty.
type postStore struct {
	pool *pgxpool.Pool
}

// initSchemaAndSeed creates the posts table and inserts demo rows once.
func (s *postStore) initSchemaAndSeed(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS posts (
			id        TEXT PRIMARY KEY,
			author_id TEXT NOT NULL,
			content   TEXT NOT NULL,
			score_ms  BIGINT NOT NULL
		)`)
	if err != nil {
		return err
	}

	var count int
	if err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM posts`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	now := nowMs()
	_, err = s.pool.Exec(ctx, `
		INSERT INTO posts (id, author_id, content, score_ms) VALUES
			('post_101', 'author_1', 'Cached post 101 — older timeline item.', $1),
			('post_102', 'author_1', 'Cached post 102 — mid timeline item.', $2),
			('post_103', 'author_1', 'Cached post 103 — newest timeline item.', $3)`,
		now-30_000, now-10_000, now)
	return err
}

// findAllOrderByScore returns posts ordered by score ascending.
func (s *postStore) findAllOrderByScore(ctx context.Context) ([]cachedPost, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, score_ms FROM posts ORDER BY score_ms ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []cachedPost
	for rows.Next() {
		var post cachedPost
		if err := rows.Scan(&post.ID, &post.ScoreMs); err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}
	return posts, rows.Err()
}
