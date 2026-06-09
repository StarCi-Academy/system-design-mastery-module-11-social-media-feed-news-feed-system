/**
 * Seed graph demo fanout vào Postgres khi DB trống.
 * (EN: Seed fanout demo graph into Postgres when DB is empty.)
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
    FollowEntity,
    PostEntity,
    PushedTimelineEntity,
} from "../entities"

@Injectable()
export class FeedSeedService implements OnModuleInit {
    constructor(
        @InjectRepository(FollowEntity)
        private readonly follows: Repository<FollowEntity>,
        @InjectRepository(PostEntity)
        private readonly posts: Repository<PostEntity>,
        @InjectRepository(PushedTimelineEntity)
        private readonly pushed: Repository<PushedTimelineEntity>,
    ) {}

    /**
     * Logic — khi DB trống, tạo follow/post/timeline push mẫu cho lab.
     * Code — OnModuleInit → posts.count() === 0 → save() cố định.
     * (EN Logic: Seed demo graph when DB has no posts.)
     * (EN Code: OnModuleInit → count === 0 → save fixed rows.)
     */
    async onModuleInit(): Promise<void> {
        if ((await this.posts.count()) > 0) {
            return
        }
        await this.follows.save([
            { userId: "usr_1", authorId: "author_1" },
            { userId: "usr_1", authorId: "kol_1" },
            { userId: "usr_2", authorId: "author_1" },
        ])
        await this.posts.save([
            {
                id: "post_1",
                authorId: "author_1",
                content: "Designing feeds starts with fanout trade-offs.",
                createdAt: "2026-05-20T08:00:00.000Z",
            },
            {
                id: "post_2",
                authorId: "kol_1",
                content: "KOL posts are usually pulled at read time.",
                createdAt: "2026-05-20T09:00:00.000Z",
            },
        ])
        await this.pushed.save([
            { userId: "usr_1", postId: "post_1", sortOrder: 0 },
            { userId: "usr_2", postId: "post_1", sortOrder: 0 },
        ])
    }
}
