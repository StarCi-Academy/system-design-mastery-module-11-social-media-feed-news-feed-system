using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;

namespace FeedCacheService;

/// <summary>Timeline cache service — Postgres source plus Redis ZSET (StackExchange.Redis).</summary>
public class FeedCacheService
{
    private const int MaxCachedItems = 500;
    private const long ReadLimit = 19;

    private readonly FeedDbContext _db;
    private readonly IConnectionMultiplexer _redis;

    public FeedCacheService(FeedDbContext db, IConnectionMultiplexer redis)
    {
        _db = db;
        _redis = redis;
    }

    /// <summary>Load posts from Postgres into the ZSET, then trim to the newest 500.</summary>
    public async Task<object> SeedTimelineAsync(string userId)
    {
        var key = FeedKey(userId);
        var rows = await _db.Posts.OrderBy(p => p.ScoreMs).ToListAsync();
        var zset = _redis.GetDatabase();
        foreach (var row in rows)
        {
            // score = epoch ms — higher score means more recent post.
            await zset.SortedSetAddAsync(key, row.Id, row.ScoreMs);
        }
        // Keep only the newest MaxCachedItems entries (drop lowest ranks).
        await zset.SortedSetRemoveRangeByRankAsync(key, 0, -(MaxCachedItems + 1));

        return new
        {
            userId,
            cacheKey = key,
            source = "postgres",
            cachedPosts = rows.Count,
            maxCachedItems = MaxCachedItems,
        };
    }

    /// <summary>Read the newest cached feed items via ZREVRANGE 0..19 WITHSCORES.</summary>
    public async Task<object> GetCachedFeedAsync(string userId)
    {
        var key = FeedKey(userId);
        var entries = await _redis.GetDatabase()
            .SortedSetRangeByRankWithScoresAsync(key, 0, ReadLimit, Order.Descending);

        var timeline = entries
            .Select(entry => new
            {
                postId = entry.Element.ToString(),
                score = (long)entry.Score,
            })
            .ToList();

        return new
        {
            model = "redis-zset-feed-cache",
            userId,
            cacheKey = key,
            readPattern = "ZREVRANGE returns the newest cached feed items first.",
            timeline,
        };
    }

    private static string FeedKey(string userId) => $"feed:{userId}";
}
