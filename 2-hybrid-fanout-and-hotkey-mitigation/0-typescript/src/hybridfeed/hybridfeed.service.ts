/**
 * Service hybrid fanout + hotkey salting — Postgres + Redis (lesson 2).
 * (EN: Hybrid fanout and hotkey salting — Postgres + Redis.)
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
    In,
    Repository,
} from "typeorm"
import type {
    RedisConfig,
} from "../config"
import {
    AuthorEntity,
    HybridPostEntity,
} from "../entities"

@Injectable()
export class HybridfeedService implements OnModuleInit, OnModuleDestroy {
    private redis!: Redis

    constructor(
        private readonly config: ConfigService,
        @InjectRepository(AuthorEntity)
        private readonly authors: Repository<AuthorEntity>,
        @InjectRepository(HybridPostEntity)
        private readonly posts: Repository<HybridPostEntity>,
    ) {}

    /**
     * Logic — khởi tạo Redis client từ config.
     * Code — OnModuleInit → ConfigService → new Redis(lazyConnect).
     * (EN Logic: Initialize Redis from config.)
     * (EN Code: OnModuleInit → ioredis lazyConnect.)
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
     * Code — OnModuleDestroy → quit().
     * (EN Logic: Close Redis on shutdown.)
     * (EN Code: OnModuleDestroy → quit().)
     */
    async onModuleDestroy(): Promise<void> {
        await this.redis?.quit()
    }

    /**
     * Logic — hybrid feed: merge push (regular) + KOL pull; cache KOL bằng key salting.
     * Code — query Postgres + SET salted key + sort createdAt.
     * (EN Logic: Hybrid feed merges push + KOL pull; salted KOL cache.)
     * (EN Code: Postgres query + SET + sort by createdAt.)
     */
    async getHybridFeed(userId: string) {
        await this.connectRedis()
        const authorRows = await this.authors.find()
        const celebrityIds = authorRows
            .filter((author) => author.isCelebrity)
            .map((author) => author.id)
        const celebritySet = new Set(celebrityIds)
        const allPosts = await this.posts.find()
        // Push path: posts from regular (non-celebrity) authors.
        const pushedTimeline = allPosts.filter((post) => !celebritySet.has(post.authorId))
        // Pull path: posts from celebrity authors, fetched at read time.
        const celebrityPosts =
            celebrityIds.length === 0
                ? []
                : await this.posts.find({ where: { authorId: In(celebrityIds) } })
        // Cache the KOL timeline under a salted key (EX 60) — hotkey mitigation.
        const saltedKey = this.getSaltedKolKey("kol_1", userId)
        await this.redis.set(
            saltedKey,
            JSON.stringify(celebrityPosts),
            "EX",
            60,
        )
        // Merge both sources and sort by createdAt descending (newest first).
        const timeline = [...pushedTimeline, ...celebrityPosts].sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
        )
        return {
            model: "hybrid-fanout",
            userId,
            strategy: {
                regularUsers: "fanout-on-write",
                celebrityUsers: "fanout-on-read",
            },
            hotkeyMitigation: {
                technique: "key-salting",
                saltedKey,
                reason: "KOL post cache is duplicated across salted keys so one Redis key does not absorb all reads.",
            },
            celebrityAuthors: celebrityIds,
            timeline,
        }
    }

    /**
     * Logic — route post: KOL dùng pull-at-read, user thường push-to-followers.
     * Code — authors.findOne → isCelebrity branch metadata.
     * (EN Logic: Route post — celebrities pull-at-read, regular users push-to-followers.)
     * (EN Code: findOne → isCelebrity branch.)
     */
    async routePost(authorId: string) {
        const author = await this.authors.findOne({ where: { id: authorId } })
        const isCelebrity = author?.isCelebrity ?? false
        return {
            authorId,
            isCelebrity,
            // Celebrities are pulled at read time (1 write); regular users are
            // pushed to every follower (writes proportional to follower count).
            route: isCelebrity ? "pull-at-read-time" : "push-to-followers",
            expectedWrites: isCelebrity ? 1 : "number_of_followers",
        }
    }

    /**
     * Logic — key salting tránh hotkey KOL trên Redis.
     * Code — charCodeAt(userId) % 4 → feed:kol:{author}:salt:N.
     * (EN Logic: Salt KOL keys to spread hotkey load.)
     * (EN Code: modulo salt on userId char code.)
     */
    private getSaltedKolKey(authorId: string, userId: string): string {
        // Deterministic salt from the last char code of userId, mod 4.
        // Spreads one KOL's cache across feed:kol:{authorId}:salt:0..3
        // so a single Redis key never absorbs all reads (hotkey mitigation).
        const salt = userId.charCodeAt(userId.length - 1) % 4
        return `feed:kol:${authorId}:salt:${salt}`
    }

    /**
     * Logic — lazy connect Redis.
     * Code — status wait → connect().
     * (EN Logic: Lazy Redis connect.)
     * (EN Code: ioredis connect if wait.)
     */
    private async connectRedis(): Promise<void> {
        if (this.redis.status === "wait") {
            await this.redis.connect()
        }
    }
}
