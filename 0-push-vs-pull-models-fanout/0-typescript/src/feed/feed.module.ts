import {
    Module,
} from "@nestjs/common"
import {
    TypeOrmModule,
} from "@nestjs/typeorm"
import {
    FeedController,
} from "./feed.controller"
import {
    FeedSeedService,
} from "./feed-seed.service"
import {
    FeedService,
} from "./feed.service"
import {
    FollowEntity,
    PostEntity,
    PushedTimelineEntity,
} from "../entities"

/**
 * Feature module — fanout push vs pull (Postgres + seed OnModuleInit).
 * (EN: Feature module — fanout push vs pull (Postgres + OnModuleInit seed).)
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([FollowEntity, PostEntity, PushedTimelineEntity]),
    ],
    controllers: [FeedController],
    providers: [FeedService, FeedSeedService],
    exports: [FeedService],
})
export class FeedModule {}
