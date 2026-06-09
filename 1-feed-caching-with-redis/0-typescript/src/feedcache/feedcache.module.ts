import {
    Module,
} from "@nestjs/common"
import {
    TypeOrmModule,
} from "@nestjs/typeorm"
import {
    FeedcacheController,
} from "./feedcache.controller"
import {
    FeedcacheSeedService,
} from "./feedcache-seed.service"
import {
    FeedcacheService,
} from "./feedcache.service"
import {
    CachedPostEntity,
} from "../entities"

/**
 * Feature module — Postgres source + Redis ZSET feed cache.
 * (EN: Feature module — Postgres source + Redis ZSET feed cache.)
 */
@Module({
    imports: [TypeOrmModule.forFeature([CachedPostEntity])],
    controllers: [FeedcacheController],
    providers: [FeedcacheService, FeedcacheSeedService],
    exports: [FeedcacheService],
})
export class FeedcacheModule {}
