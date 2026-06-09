using Microsoft.EntityFrameworkCore;

namespace FeedCacheService;

/// <summary>Post entity — source rows before ZADD into Redis ZSET.</summary>
public class CachedPost
{
    public string Id { get; set; } = default!;
    public string AuthorId { get; set; } = default!;
    public string Content { get; set; } = default!;

    // Epoch milliseconds used as ZSET score; stored as bigint.
    public long ScoreMs { get; set; }
}

/// <summary>EF Core context mapping posts table.</summary>
public class FeedDbContext : DbContext
{
    public FeedDbContext(DbContextOptions<FeedDbContext> options) : base(options)
    {
    }

    public DbSet<CachedPost> Posts => Set<CachedPost>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var post = modelBuilder.Entity<CachedPost>();
        post.ToTable("posts");
        post.HasKey(p => p.Id);
        post.Property(p => p.Id).HasColumnName("id");
        post.Property(p => p.AuthorId).HasColumnName("author_id");
        post.Property(p => p.Content).HasColumnName("content");
        post.Property(p => p.ScoreMs).HasColumnName("score_ms");
    }
}
