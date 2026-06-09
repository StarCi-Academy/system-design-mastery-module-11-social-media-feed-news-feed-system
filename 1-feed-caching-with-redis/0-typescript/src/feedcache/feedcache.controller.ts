import {
    Controller,
    Get,
    Post,
    Query,
} from "@nestjs/common"
import {
    FeedcacheService,
} from "./feedcache.service"

/**
 * HTTP controller — Redis ZSET feed cache (seed / read).
 * (EN: HTTP controller — Redis ZSET feed cache (seed / read).)
 */
@Controller("api/feed")
export class FeedcacheController {
    constructor(
        private readonly service: FeedcacheService,
    ) {}

    /**
     * Logic — seed timeline Redis ZSET cho user (lab).
     * Code — POST /api/feed/cache/seed?userId → seedTimeline.
     * (EN Logic: Seed Redis ZSET timeline for user.)
     * (EN Code: POST cache/seed → seedTimeline.)
     */
    @Post("cache/seed")
    seedTimeline(@Query("userId") userId = "usr_1"): ReturnType<FeedcacheService["seedTimeline"]> {
        return this.service.seedTimeline(userId)
    }

    /**
     * Logic — đọc feed đã cache (ZREVRANGE).
     * Code — GET /api/feed/cache?userId → getCachedFeed.
     * (EN Logic: Read cached feed via ZREVRANGE.)
     * (EN Code: GET cache → getCachedFeed.)
     */
    @Get("cache")
    getCachedFeed(@Query("userId") userId = "usr_1"): ReturnType<FeedcacheService["getCachedFeed"]> {
        return this.service.getCachedFeed(userId)
    }
}
