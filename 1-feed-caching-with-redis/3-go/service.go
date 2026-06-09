package main

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	maxCachedItems = 500
	readLimit      = 19
)

// feedService materializes Postgres rows into a Redis ZSET timeline.
type feedService struct {
	store *postStore
	rdb   *redis.Client
}

// timelineItem is one entry returned to the client.
type timelineItem struct {
	PostID string `json:"postId"`
	Score  int64  `json:"score"`
}

// seedTimeline loads posts into the ZSET, then trims to the newest 500.
func (s *feedService) seedTimeline(ctx context.Context, userID string) (map[string]any, error) {
	key := feedKey(userID)
	posts, err := s.store.findAllOrderByScore(ctx)
	if err != nil {
		return nil, err
	}
	for _, post := range posts {
		// score = epoch ms — higher score means more recent post.
		if err := s.rdb.ZAdd(ctx, key, redis.Z{
			Score:  float64(post.ScoreMs),
			Member: post.ID,
		}).Err(); err != nil {
			return nil, err
		}
	}
	// Keep only the newest maxCachedItems entries (drop lowest ranks).
	if err := s.rdb.ZRemRangeByRank(ctx, key, 0, -(maxCachedItems + 1)).Err(); err != nil {
		return nil, err
	}

	return map[string]any{
		"userId":        userID,
		"cacheKey":      key,
		"source":        "postgres",
		"cachedPosts":   len(posts),
		"maxCachedItems": maxCachedItems,
	}, nil
}

// getCachedFeed reads the newest cached items via ZREVRANGE 0..19 WITHSCORES.
func (s *feedService) getCachedFeed(ctx context.Context, userID string) (map[string]any, error) {
	key := feedKey(userID)
	entries, err := s.rdb.ZRevRangeWithScores(ctx, key, 0, readLimit).Result()
	if err != nil {
		return nil, err
	}

	timeline := make([]timelineItem, 0, len(entries))
	for _, entry := range entries {
		member, _ := entry.Member.(string)
		timeline = append(timeline, timelineItem{
			PostID: member,
			Score:  int64(entry.Score),
		})
	}

	return map[string]any{
		"model":       "redis-zset-feed-cache",
		"userId":      userID,
		"cacheKey":    key,
		"readPattern": "ZREVRANGE returns the newest cached feed items first.",
		"timeline":    timeline,
	}, nil
}

func feedKey(userID string) string {
	return "feed:" + userID
}

func nowMs() int64 {
	return time.Now().UnixMilli()
}
