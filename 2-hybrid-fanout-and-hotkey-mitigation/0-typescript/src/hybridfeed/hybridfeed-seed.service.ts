/**
 * Seed authors/posts hybrid vào Postgres khi DB trống.
 * (EN: Seed hybrid authors/posts into Postgres when DB is empty.)
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
    AuthorEntity,
    HybridPostEntity,
} from "../entities"

@Injectable()
export class HybridfeedSeedService implements OnModuleInit {
    constructor(
        @InjectRepository(AuthorEntity)
        private readonly authors: Repository<AuthorEntity>,
        @InjectRepository(HybridPostEntity)
        private readonly posts: Repository<HybridPostEntity>,
    ) {}

    /**
     * Logic — khi DB trống, tạo author thường + KOL và post mẫu.
     * Code — OnModuleInit → posts.count() === 0 → save authors + posts.
     * (EN Logic: Seed regular author, KOL, and demo posts when empty.)
     * (EN Code: OnModuleInit → count === 0 → save rows.)
     */
    async onModuleInit(): Promise<void> {
        if ((await this.posts.count()) > 0) {
            return
        }
        await this.authors.save([
            { id: "author_1", isCelebrity: false },
            { id: "kol_1", isCelebrity: true },
        ])
        await this.posts.save([
            {
                id: "post_201",
                authorId: "author_1",
                content: "Regular author post was pushed into the user feed.",
                createdAt: "2026-05-20T08:30:00.000Z",
            },
            {
                id: "post_301",
                authorId: "kol_1",
                content: "KOL post is pulled and merged at read time.",
                createdAt: "2026-05-20T09:30:00.000Z",
            },
        ])
    }
}
