import {
    Body,
    Controller,
    Get,
    Post,
    Query,
} from "@nestjs/common"
import {
    FeedService,
} from "./feed.service"
import {
    CreateFeedDto,
} from "./dto"

/**
 * HTTP controller — so sánh fanout pull vs push.
 * (EN: HTTP controller — compare fanout pull vs push.)
 */
@Controller("api/feed")
export class FeedController {
    constructor(
        private readonly service: FeedService,
    ) {}

    /**
     * Logic — demo fanout-on-read (pull) cho userId.
     * Code — GET /api/feed/pull → FeedService.getPullFeed.
     * (EN Logic: Demo fanout-on-read (pull) for userId.)
     * (EN Code: GET /api/feed/pull → getPullFeed.)
     */
    @Get("pull")
    getPullFeed(@Query("userId") userId = "usr_1"): ReturnType<FeedService["getPullFeed"]> {
        return this.service.getPullFeed(userId)
    }

    /**
     * Logic — demo fanout-on-write (push) timeline đã materialize.
     * Code — GET /api/feed/push → FeedService.getPushFeed.
     * (EN Logic: Demo fanout-on-write (push) materialized timeline.)
     * (EN Code: GET /api/feed/push → getPushFeed.)
     */
    @Get("push")
    getPushFeed(@Query("userId") userId = "usr_1"): ReturnType<FeedService["getPushFeed"]> {
        return this.service.getPushFeed(userId)
    }

    /**
     * Logic — tạo post và fanout-on-write vào follower timelines.
     * Code — POST /api/feed/post + CreateFeedDto → createPost.
     * (EN Logic: Create post and fanout-on-write to followers.)
     * (EN Code: POST body → createPost.)
     */
    @Post("post")
    createPost(@Body() body: CreateFeedDto): ReturnType<FeedService["createPost"]> {
        return this.service.createPost(
            body.authorId ?? "author_1",
            body.content ?? "New post from feed-service",
        )
    }
}
