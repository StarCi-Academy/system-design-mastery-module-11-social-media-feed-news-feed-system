using Microsoft.EntityFrameworkCore;

// Push vs pull fanout reference service (ASP.NET Core + EF Core).
// Postgres-only: follows / posts / pushed_timeline. Same contract as the
// TypeScript / Java / Go ports.

var builder = WebApplication.CreateBuilder(args);

string Env(string key, string fallback) =>
    Environment.GetEnvironmentVariable(key) is { Length: > 0 } v ? v : fallback;

var connectionString =
    $"Host={Env("POSTGRES_HOST", "localhost")};" +
    $"Port={Env("POSTGRES_PORT", "5432")};" +
    $"Username={Env("POSTGRES_USER", "postgres")};" +
    $"Password={Env("POSTGRES_PASSWORD", "postgres")};" +
    $"Database={Env("POSTGRES_DB", "feed_service")}";

builder.Services.AddDbContext<FeedDbContext>(options => options.UseNpgsql(connectionString));
builder.WebHost.UseUrls($"http://0.0.0.0:{Env("PORT", "3000")}");

var app = builder.Build();

// Apply schema and seed the demo graph when the database is empty.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<FeedDbContext>();
    db.Database.EnsureCreated();
    FeedSeed.Seed(db);
}

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// GET /api/feed/pull — fanout-on-read: aggregate followed authors' posts at read time.
app.MapGet("/api/feed/pull", async (FeedDbContext db, string? userId) =>
{
    userId ??= "usr_1";
    var followedAuthors = await db.Follows
        .Where(f => f.UserId == userId)
        .Select(f => f.AuthorId)
        .ToListAsync();
    var timeline = followedAuthors.Count == 0
        ? new List<Post>()
        : await db.Posts
            .Where(p => followedAuthors.Contains(p.AuthorId))
            .OrderByDescending(p => p.CreatedAt)
            .ToListAsync();
    return Results.Ok(new
    {
        model = "fanout-on-read",
        userId,
        followedAuthors,
        readCost = "Reads join/filter recent posts from followed authors when the user opens feed.",
        writeCost = "Post creation is cheap because no follower timelines are pre-written.",
        timeline,
    });
});

// GET /api/feed/push — fanout-on-write read: serve the pre-materialized timeline.
app.MapGet("/api/feed/push", async (FeedDbContext db, string? userId) =>
{
    userId ??= "usr_1";
    var postIds = await db.PushedTimeline
        .Where(t => t.UserId == userId)
        .OrderBy(t => t.SortOrder)
        .Select(t => t.PostId)
        .ToListAsync();
    var posts = postIds.Count == 0
        ? new List<Post>()
        : await db.Posts.Where(p => postIds.Contains(p.Id)).ToListAsync();
    var byId = posts.ToDictionary(p => p.Id);
    var timeline = postIds.Where(byId.ContainsKey).Select(id => byId[id]).ToList();
    return Results.Ok(new
    {
        model = "fanout-on-write",
        userId,
        materializedPostIds = postIds,
        readCost = "Reads are fast because the user timeline is already materialized.",
        writeCost = "Posting is expensive for authors with many followers.",
        timeline,
    });
});

// POST /api/feed/post — create a post and fanout-on-write into follower timelines.
app.MapPost("/api/feed/post", async (FeedDbContext db, CreatePostRequest? body) =>
{
    var authorId = body?.AuthorId ?? "author_1";
    var content = body?.Content ?? "New post from feed-service";
    var count = await db.Posts.CountAsync();
    var post = new Post
    {
        Id = $"post_{count + 1}",
        AuthorId = authorId,
        Content = content,
        CreatedAt = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
    };
    db.Posts.Add(post);
    await db.SaveChangesAsync();

    var followerIds = await db.Follows
        .Where(f => f.AuthorId == authorId)
        .Select(f => f.UserId)
        .ToListAsync();
    var sortOrder = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    foreach (var followerId in followerIds)
    {
        db.PushedTimeline.Add(new PushedTimeline { UserId = followerId, PostId = post.Id, SortOrder = sortOrder });
        sortOrder++;
    }
    await db.SaveChangesAsync();

    return Results.Json(new
    {
        model = "fanout-on-write",
        post,
        followerIds,
        fanoutWrites = followerIds.Count,
    }, statusCode: 201);
});

app.Run();

/// <summary>Post row persisted in Postgres.</summary>
public class Post
{
    public string Id { get; set; } = default!;
    public string AuthorId { get; set; } = default!;
    public string Content { get; set; } = default!;
    public string CreatedAt { get; set; } = default!;
}

/// <summary>Follow edge: a user follows an author.</summary>
public class Follow
{
    public string UserId { get; set; } = default!;
    public string AuthorId { get; set; } = default!;
}

/// <summary>Materialized push timeline entry: a post id pre-written for a user.</summary>
public class PushedTimeline
{
    public string UserId { get; set; } = default!;
    public string PostId { get; set; } = default!;
    public long SortOrder { get; set; }
}

public record CreatePostRequest(string? AuthorId, string? Content);

/// <summary>EF Core context for the fanout demo tables.</summary>
public class FeedDbContext : DbContext
{
    public FeedDbContext(DbContextOptions<FeedDbContext> options) : base(options)
    {
    }

    public DbSet<Post> Posts => Set<Post>();
    public DbSet<Follow> Follows => Set<Follow>();
    public DbSet<PushedTimeline> PushedTimeline => Set<PushedTimeline>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Post>().ToTable("posts").HasKey(p => p.Id);
        modelBuilder.Entity<Follow>().ToTable("follows").HasKey(f => new { f.UserId, f.AuthorId });
        modelBuilder.Entity<PushedTimeline>().ToTable("pushed_timeline").HasKey(t => new { t.UserId, t.PostId });
    }
}

/// <summary>Seeds the demo fanout graph when the posts table is empty.</summary>
public static class FeedSeed
{
    public static void Seed(FeedDbContext db)
    {
        if (db.Posts.Any())
        {
            return;
        }
        db.Follows.AddRange(
            new Follow { UserId = "usr_1", AuthorId = "author_1" },
            new Follow { UserId = "usr_1", AuthorId = "kol_1" },
            new Follow { UserId = "usr_2", AuthorId = "author_1" });
        db.Posts.AddRange(
            new Post { Id = "post_1", AuthorId = "author_1", Content = "Designing feeds starts with fanout trade-offs.", CreatedAt = "2026-05-20T08:00:00.000Z" },
            new Post { Id = "post_2", AuthorId = "kol_1", Content = "KOL posts are usually pulled at read time.", CreatedAt = "2026-05-20T09:00:00.000Z" });
        db.PushedTimeline.AddRange(
            new PushedTimeline { UserId = "usr_1", PostId = "post_1", SortOrder = 0 },
            new PushedTimeline { UserId = "usr_2", PostId = "post_1", SortOrder = 0 });
        db.SaveChanges();
    }
}
