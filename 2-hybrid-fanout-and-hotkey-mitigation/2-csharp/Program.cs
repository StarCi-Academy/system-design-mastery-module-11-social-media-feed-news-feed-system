// Hybrid fanout + hotkey salting reference service (ASP.NET Core minimal API).
// Mirrors the canonical contract shared by all four language ports.
using System.Text.Json;
using Npgsql;
using StackExchange.Redis;

string Env(string key, string def) =>
    Environment.GetEnvironmentVariable(key) is { Length: > 0 } v ? v : def;

var dsn = $"Host={Env("POSTGRES_HOST", "db")};Port={Env("POSTGRES_PORT", "5432")};" +
          $"Username={Env("POSTGRES_USER", "postgres")};Password={Env("POSTGRES_PASSWORD", "postgres")};" +
          $"Database={Env("POSTGRES_DB", "hybrid_feed_service")}";

// Wait for Postgres to become available, then create schema and seed demo rows.
// Retry loop is required because Postgres container may not be ready immediately.
NpgsqlDataSource? db = null;
for (var i = 0; i < 30; i++)
{
    try
    {
        db = NpgsqlDataSource.Create(dsn);
        await using var ping = db.CreateCommand("SELECT 1");
        await ping.ExecuteScalarAsync();
        break;
    }
    catch (Exception ex)
    {
        Console.WriteLine($"waiting for postgres ({i}): {ex.Message}");
        await Task.Delay(2000);
    }
}
if (db is null) throw new InvalidOperationException("postgres unreachable");

await using (var create = db.CreateCommand(
    """
    CREATE TABLE IF NOT EXISTS authors (id TEXT PRIMARY KEY, "isCelebrity" BOOLEAN NOT NULL DEFAULT false);
    CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, "authorId" TEXT NOT NULL, content TEXT NOT NULL, "createdAt" TEXT NOT NULL);
    """))
{
    await create.ExecuteNonQueryAsync();
}

await using (var countCmd = db.CreateCommand("SELECT COUNT(*) FROM posts"))
{
    var count = Convert.ToInt64(await countCmd.ExecuteScalarAsync());
    if (count == 0)
    {
        await using var seed = db.CreateCommand(
            """
            INSERT INTO authors (id, "isCelebrity") VALUES ('author_1', false), ('kol_1', true);
            INSERT INTO posts (id, "authorId", content, "createdAt") VALUES
              ('post_201', 'author_1', 'Regular author post was pushed into the user feed.', '2026-05-20T08:30:00.000Z'),
              ('post_301', 'kol_1', 'KOL post is pulled and merged at read time.', '2026-05-20T09:30:00.000Z');
            """);
        await seed.ExecuteNonQueryAsync();
    }
}

var redis = await ConnectionMultiplexer.ConnectAsync(
    $"{Env("REDIS_HOST", "redis")}:{Env("REDIS_PORT", "6379")}");

// SaltedKolKey: spread KOL hotkey across 4 salt slots using last char of userId.
// Deterministic (same userId always maps to same slot) so one key never absorbs all reads.
static string SaltedKolKey(string authorId, string userId)
{
    // Last character code mod 4 → slot 0..3 for balanced read distribution.
    var salt = userId.Length > 0 ? userId[^1] % 4 : 0;
    return $"feed:kol:{authorId}:salt:{salt}";
}

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls($"http://0.0.0.0:{Env("PORT", "3000")}");
var app = builder.Build();

// Health: simple liveness probe used by Docker or load balancers.
app.MapGet("/health", () => Results.Json(new { status = "ok" }));

// GET /api/feed/hybrid — merge push (regular) and pull (KOL) timelines.
// Cache KOL posts under a salted key (EX 60) to mitigate Redis hotkey load.
app.MapGet("/api/feed/hybrid", async (string? userId) =>
{
    userId ??= "usr_1";
    // Read all authors; build celebrity set and ordered list for response.
    var celebrityIds = new List<string>();
    var celebritySet = new HashSet<string>();
    await using (var authors = db.CreateCommand("SELECT id, \"isCelebrity\" FROM authors"))
    await using (var ar = await authors.ExecuteReaderAsync())
    {
        while (await ar.ReadAsync())
        {
            // isCelebrity=true → pull-at-read-time; false → push-to-followers.
            if (ar.GetBoolean(1))
            {
                celebrityIds.Add(ar.GetString(0));
                celebritySet.Add(ar.GetString(0));
            }
        }
    }

    // Split all posts: pushed (regular authors) vs celebrity posts (KOL pull path).
    var pushed = new List<object>();
    var celebrityPosts = new List<Dictionary<string, string>>();
    await using (var posts = db.CreateCommand("SELECT id, \"authorId\", content, \"createdAt\" FROM posts"))
    await using (var pr = await posts.ExecuteReaderAsync())
    {
        while (await pr.ReadAsync())
        {
            var row = new Dictionary<string, string>
            {
                ["id"] = pr.GetString(0),
                ["authorId"] = pr.GetString(1),
                ["content"] = pr.GetString(2),
                ["createdAt"] = pr.GetString(3),
            };
            // Push path: regular authors. Pull path: celebrity authors.
            if (celebritySet.Contains(row["authorId"])) celebrityPosts.Add(row);
            else pushed.Add(row);
        }
    }

    // Cache the KOL timeline under a salted key (EX 60) — hotkey mitigation.
    var saltedKey = SaltedKolKey("kol_1", userId);
    await redis.GetDatabase().StringSetAsync(
        saltedKey, JsonSerializer.Serialize(celebrityPosts), TimeSpan.FromSeconds(60));

    // Merge both sources and sort by createdAt descending (newest first).
    var timeline = pushed.Concat(celebrityPosts.Cast<object>())
        .OrderByDescending(p => ((dynamic)p)["createdAt"])
        .ToList();

    return Results.Json(new
    {
        model = "hybrid-fanout",
        userId,
        strategy = new { regularUsers = "fanout-on-write", celebrityUsers = "fanout-on-read" },
        hotkeyMitigation = new
        {
            technique = "key-salting",
            saltedKey,
            reason = "KOL post cache is duplicated across salted keys so one Redis key does not absorb all reads.",
        },
        celebrityAuthors = celebrityIds,
        timeline,
    });
});

// GET /api/feed/hybrid/route — routing decision for a given author.
// KOL (isCelebrity=true) → pull-at-read-time (1 write); regular → push-to-followers.
app.MapGet("/api/feed/hybrid/route", async (string? authorId) =>
{
    authorId ??= "kol_1";
    var isCelebrity = false;
    // Look up the author's celebrity flag; default false if not found.
    await using (var cmd = db.CreateCommand("SELECT \"isCelebrity\" FROM authors WHERE id = $1"))
    {
        cmd.Parameters.AddWithValue(authorId);
        var result = await cmd.ExecuteScalarAsync();
        if (result is bool b) isCelebrity = b;
    }
    return Results.Json(new
    {
        authorId,
        isCelebrity,
        // Celebrities are pulled at read time (1 write); regular users are
        // pushed to every follower (writes proportional to follower count).
        route = isCelebrity ? "pull-at-read-time" : "push-to-followers",
        // expectedWrites quantifies write amplification for the chosen route.
        expectedWrites = isCelebrity ? (object)1 : "number_of_followers",
    });
});

app.Run();
