/**
 * Service cache timeline: Postgres (source) + Redis ZSET (lesson 1).
 * (EN: Timeline cache service — Postgres source + Redis ZSET.)
 */
import {
    Injectable,
    OnModuleDestroy,
    OnModuleInit,
} from "@nestjs/common"
import {
    ConfigService,
} from "@nestjs/config"
import {
    InjectRepository,
} from "@nestjs/typeorm"
import Redis from "ioredis"
import {
    Repository,
} from "typeorm"
import type {
    RedisConfig,
} from "../config"
import {
    CachedPostEntity,
} from "../entities"

@Injectable()
export class FeedcacheService implements OnModuleInit, OnModuleDestroy {
    private redis!: Redis

    constructor(
        private readonly config: ConfigService,
        @InjectRepository(CachedPostEntity)
        private readonly posts: Repository<CachedPostEntity>,
    ) {}

    /**
     * Logic — khởi tạo Redis client từ config (lazyConnect).
     * Code — OnModuleInit → ConfigService redis → new Redis().
     * (EN Logic: Initialize Redis client from config.)
     * (EN Code: OnModuleInit → ioredis with lazyConnect.)
     */
    onModuleInit(): void {
        const redis = this.config.getOrThrow<RedisConfig>("redis")
        this.redis = new Redis({
            host: redis.host,
            port: redis.port,
            lazyConnect: true,
        })
    }

    /**
     * Logic — đóng Redis khi shutdown.
     * Code — OnModuleDestroy → redis.quit().
     * (EN Logic: Close Redis on shutdown.)
     * (EN Code: OnModuleDestroy → quit().)
     */
    async onModuleDestroy(): Promise<void> {
        await this.redis?.quit()
    }

    /**
     * Logic — đọc post từ Postgres, materialize vào ZSET, trim 500 phần tử.
     * Code — find posts → ZADD scoreMs → ZREMRANGEBYRANK cap 500.
     * (EN Logic: Load posts from Postgres into ZSET with trim.)
     * (EN Code: find → ZADD → ZREMRANGEBYRANK 500.)
     */
    async seedTimeline(userId: string) {
        await this.connectRedis()
        const key = this.getFeedKey(userId)
        const rows = await this.posts.find({ order: { scoreMs: "ASC" } })
        for (const row of rows) {
            // score = epoch ms — higher score means more recent post.
            await this.redis.zadd(key, row.scoreMs, row.id)
        }
        // Keep only the newest 500 entries (drop the lowest ranks).
        await this.redis.zremrangebyrank(key, 0, -501)
        return {
            userId,
            cacheKey: key,
            source: "postgres",
            cachedPosts: rows.length,
            maxCachedItems: 500,
        }
    }

    /**
     * Logic — đọc feed mới nhất từ ZSET (ZREVRANGE).
     * Code — ZREVRANGE 0..19 WITHSCORES → parse timeline.
     * (EN Logic: Read newest feed items via ZREVRANGE.)
     * (EN Code: ZREVRANGE WITHSCORES parse pairs.)
     */
    async getCachedFeed(userId: string) {
        await this.connectRedis()
        const key = this.getFeedKey(userId)
        const postIds = await this.redis.zrevrange(key, 0, 19, "WITHSCORES")
        const timeline = []
        // ioredis returns [member, score, member, score, ...] when WITHSCORES is set.
        for (let index = 0; index < postIds.length; index += 2) {
            timeline.push({
                postId: postIds[index],
                score: Number(postIds[index + 1]),
            })
        }
        return {
            model: "redis-zset-feed-cache",
            userId,
            cacheKey: key,
            readPattern: "ZREVRANGE returns the newest cached feed items first.",
            timeline,
        }
    }

    /**
     * Logic — key timeline per user trong Redis.
     * Code — template feed:{userId}.
     * (EN Logic: Per-user timeline Redis key.)
     * (EN Code: template feed:{userId}.)
     */
    private getFeedKey(userId: string): string {
        return `feed:${userId}`
    }

    /**
     * Logic — lazy connect Redis lần đầu dùng.
     * Code — if status wait → connect().
     * (EN Logic: Lazy Redis connect on first use.)
     * (EN Code: ioredis lazy connect.)
     */
    private async connectRedis(): Promise<void> {
        if (this.redis.status === "wait") {
            await this.redis.connect()
        }
    }
}
