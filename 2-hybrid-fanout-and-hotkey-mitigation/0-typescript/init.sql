-- Schema authority for the TypeScript port (TypeORM synchronize: false).
-- Mounted into Postgres at /docker-entrypoint-initdb.d so the authors/posts
-- tables exist before the app boots; HybridfeedSeedService then inserts demo
-- rows on first start. Column names match the TypeORM entity properties
-- (camelCase => quoted in Postgres), identical to the Go/Java/C# ports.
CREATE TABLE IF NOT EXISTS authors (
    id TEXT PRIMARY KEY,
    "isCelebrity" BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    "authorId" TEXT NOT NULL,
    content TEXT NOT NULL,
    "createdAt" TEXT NOT NULL
);
