import {
    Controller,
    Get,
    Query,
} from "@nestjs/common"
import {
    HybridfeedService,
} from "./hybridfeed.service"

/**
 * HTTP controller — hybrid fanout + hotkey routing.
 * (EN: HTTP controller — hybrid fanout + hotkey routing.)
 */
@Controller("api/feed")
export class HybridfeedController {
    constructor(
        private readonly service: HybridfeedService,
    ) {}

    /**
     * Logic — merge push timeline + KOL pull; demo key salting.
     * Code — GET /api/feed/hybrid → getHybridFeed.
     * (EN Logic: Hybrid feed merge + salted KOL cache.)
     * (EN Code: GET hybrid → getHybridFeed.)
     */
    @Get("hybrid")
    getHybridFeed(@Query("userId") userId = "usr_1"): ReturnType<HybridfeedService["getHybridFeed"]> {
        return this.service.getHybridFeed(userId)
    }

    /**
     * Logic — xem route post KOL (pull) vs user thường (push).
     * Code — GET /api/feed/hybrid/route?authorId → routePost.
     * (EN Logic: Show routing for KOL vs regular author.)
     * (EN Code: GET hybrid/route → routePost.)
     */
    @Get("hybrid/route")
    routePost(@Query("authorId") authorId = "kol_1"): ReturnType<HybridfeedService["routePost"]> {
        return this.service.routePost(authorId)
    }
}
