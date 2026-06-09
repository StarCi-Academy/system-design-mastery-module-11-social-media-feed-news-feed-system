using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;
using FeedCacheService;

var builder = WebApplication.CreateBuilder(args);

// Bind config from environment variables (config-layer, not scattered reads).
var pgHost = Environment.GetEnvironmentVariable("POSTGRES_HOST") ?? "localhost";
var pgPort = Environment.GetEnvironmentVariable("POSTGRES_PORT") ?? "5432";
var pgUser = Environment.GetEnvironmentVariable("POSTGRES_USER") ?? "postgres";
var pgPass = Environment.GetEnvironmentVariable("POSTGRES_PASSWORD") ?? "postgres";
var pgDb = Environment.GetEnvironmentVariable("POSTGRES_DB") ?? "feed_cache_service";
var redisHost = Environment.GetEnvironmentVariable("REDIS_HOST") ?? "localhost";
var redisPort = Environment.GetEnvironmentVariable("REDIS_PORT") ?? "6379";
var port = Environment.GetEnvironmentVariable("PORT") ?? "3000";

var connectionString = $"Host={pgHost};Port={pgPort};Username={pgUser};Password={pgPass};Database={pgDb}";

builder.Services.AddDbContext<FeedDbContext>(options => options.UseNpgsql(connectionString));
builder.Services.AddSingleton<IConnectionMultiplexer>(
    ConnectionMultiplexer.Connect($"{redisHost}:{redisPort}"));
builder.Services.AddScoped<FeedCacheService.FeedCacheService>();

builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

var app = builder.Build();

// Ensure schema and seed demo posts when the table is empty.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<FeedDbContext>();
    db.Database.EnsureCreated();
    if (!db.Posts.Any())
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        db.Posts.AddRange(
            new CachedPost { Id = "post_101", AuthorId = "author_1", Content = "Cached post 101 — older timeline item.", ScoreMs = now - 30_000 },
            new CachedPost { Id = "post_102", AuthorId = "author_1", Content = "Cached post 102 — mid timeline item.", ScoreMs = now - 10_000 },
            new CachedPost { Id = "post_103", AuthorId = "author_1", Content = "Cached post 103 — newest timeline item.", ScoreMs = now });
        db.SaveChanges();
    }
}

app.MapPost("/api/feed/cache/seed", async (string? userId, FeedCacheService.FeedCacheService service) =>
    Results.Ok(await service.SeedTimelineAsync(userId ?? "usr_1")));

app.MapGet("/api/feed/cache", async (string? userId, FeedCacheService.FeedCacheService service) =>
    Results.Ok(await service.GetCachedFeedAsync(userId ?? "usr_1")));

app.Run();
