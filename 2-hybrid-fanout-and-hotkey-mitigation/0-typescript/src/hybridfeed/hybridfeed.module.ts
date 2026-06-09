import {
    Module,
} from "@nestjs/common"
import {
    TypeOrmModule,
} from "@nestjs/typeorm"
import {
    HybridfeedController,
} from "./hybridfeed.controller"
import {
    HybridfeedSeedService,
} from "./hybridfeed-seed.service"
import {
    HybridfeedService,
} from "./hybridfeed.service"
import {
    AuthorEntity,
    HybridPostEntity,
} from "../entities"

/**
 * Feature module — hybrid fanout + Postgres + Redis key salting.
 * (EN: Feature module — hybrid fanout + Postgres + Redis key salting.)
 */
@Module({
    imports: [TypeOrmModule.forFeature([AuthorEntity, HybridPostEntity])],
    controllers: [HybridfeedController],
    providers: [HybridfeedService, HybridfeedSeedService],
    exports: [HybridfeedService],
})
export class HybridfeedModule {}
