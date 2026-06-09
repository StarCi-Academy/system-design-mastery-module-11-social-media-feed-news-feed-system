package com.starci.feedcache;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.data.redis.connection.StringRedisConnection;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.stereotype.Service;

/**
 * Timeline cache service — Postgres source plus Redis ZSET (Lettuce client).
 */
@Service
public class FeedCacheService {
    private static final int MAX_CACHED_ITEMS = 500;
    private static final long READ_LIMIT = 19;

    private final CachedPostRepository posts;
    private final StringRedisTemplate redis;

    public FeedCacheService(CachedPostRepository posts, StringRedisTemplate redis) {
        this.posts = posts;
        this.redis = redis;
    }

    /**
     * Load posts from Postgres into the ZSET, then trim to the newest 500.
     * Mirrors ZADD scoreMs id + ZREMRANGEBYRANK 0 -501.
     */
    public Map<String, Object> seedTimeline(String userId) {
        String key = feedKey(userId);
        List<CachedPost> rows = posts.findAllByOrderByScoreMsAsc();
        ZSetOperations<String, String> zset = redis.opsForZSet();
        for (CachedPost row : rows) {
            // score = epoch ms — higher score means more recent post.
            zset.add(key, row.getId(), row.getScoreMs());
        }
        // Keep only the newest MAX_CACHED_ITEMS entries (drop lowest ranks).
        zset.removeRange(key, 0, -(MAX_CACHED_ITEMS + 1));

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("userId", userId);
        response.put("cacheKey", key);
        response.put("source", "postgres");
        response.put("cachedPosts", rows.size());
        response.put("maxCachedItems", MAX_CACHED_ITEMS);
        return response;
    }

    /**
     * Read the newest cached feed items via ZREVRANGE 0..19 WITHSCORES.
     */
    public Map<String, Object> getCachedFeed(String userId) {
        String key = feedKey(userId);
        Set<ZSetOperations.TypedTuple<String>> tuples =
            redis.opsForZSet().reverseRangeWithScores(key, 0, READ_LIMIT);

        List<Map<String, Object>> timeline = new ArrayList<>();
        if (tuples != null) {
            for (ZSetOperations.TypedTuple<String> tuple : tuples) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("postId", tuple.getValue());
                Double score = tuple.getScore();
                item.put("score", score == null ? 0L : score.longValue());
                timeline.add(item);
            }
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("model", "redis-zset-feed-cache");
        response.put("userId", userId);
        response.put("cacheKey", key);
        response.put("readPattern", "ZREVRANGE returns the newest cached feed items first.");
        response.put("timeline", timeline);
        return response;
    }

    private String feedKey(String userId) {
        return "feed:" + userId;
    }
}
