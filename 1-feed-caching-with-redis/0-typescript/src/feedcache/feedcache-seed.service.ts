/**
 * Seed posts demo vào Postgres (lesson 1 — nguồn trước Redis cache).
 * (EN: Seed demo posts into Postgres before Redis timeline cache.)
 */
import {
    Injectable,
    OnModuleInit,
} from "@nestjs/common"
import {
    InjectRepository,
} from "@nestjs/typeorm"
import {
    Repository,
} from "typeorm"
import {
    CachedPostEntity,
} from "../entities"

@Injectable()
export class FeedcacheSeedService implements OnModuleInit {
    constructor(
        @InjectRepository(CachedPostEntity)
        private readonly posts: Repository<CachedPostEntity>,
    ) {}

    /**
     * Logic — khi DB trống, tạo post mẫu có scoreMs cho ZSET.
     * Code — OnModuleInit → count() === 0 → save post_101..103.
     * (EN Logic: Seed posts with scoreMs when DB is empty.)
     * (EN Code: OnModuleInit → count === 0 → save demo posts.)
     */
    async onModuleInit(): Promise<void> {
        if ((await this.posts.count()) > 0) {
            return
        }
        const now = Date.now()
        await this.posts.save([
            {
                id: "post_101",
                authorId: "author_1",
                content: "Cached post 101 — older timeline item.",
                scoreMs: String(now - 30_000),
            },
            {
                id: "post_102",
                authorId: "author_1",
                content: "Cached post 102 — mid timeline item.",
                scoreMs: String(now - 10_000),
            },
            {
                id: "post_103",
                authorId: "author_1",
                content: "Cached post 103 — newest timeline item.",
                scoreMs: String(now),
            },
        ])
    }
}
