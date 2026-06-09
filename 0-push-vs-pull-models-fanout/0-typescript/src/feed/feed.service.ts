/**
 * Service so sánh fanout-on-read (pull) và fanout-on-write (push) — Postgres.
 * (EN: Service comparing fanout-on-read (pull) vs fanout-on-write (push) — Postgres.)
 */
import {
    Injectable,
} from "@nestjs/common"
import {
    InjectRepository,
} from "@nestjs/typeorm"
import {
    In,
    Repository,
} from "typeorm"
import {
    FollowEntity,
    PostEntity,
    PushedTimelineEntity,
} from "../entities"

@Injectable()
export class FeedService {
    constructor(
        @InjectRepository(FollowEntity)
        private readonly follows: Repository<FollowEntity>,
        @InjectRepository(PostEntity)
        private readonly posts: Repository<PostEntity>,
        @InjectRepository(PushedTimelineEntity)
        private readonly pushed: Repository<PushedTimelineEntity>,
    ) {}

    /**
     * Logic — fanout-on-read: lọc post của author đang follow khi user mở feed.
     * Code — follows.find → posts.find In(authorIds) → sort createdAt.
     * (EN Logic: Fanout-on-read — filter followed authors' posts at read time.)
     * (EN Code: follows.find → posts In(authorIds) → sort createdAt.)
     */
    async getPullFeed(userId: string) {
        const followed = await this.follows.find({ where: { userId } })
        const followedAuthors = followed.map((row) => row.authorId)
        const timeline =
            followedAuthors.length === 0
                ? []
                : await this.posts.find({
                      where: { authorId: In(followedAuthors) },
                      order: { createdAt: "DESC" },
                  })
        return {
            model: "fanout-on-read",
            userId,
            followedAuthors,
            readCost: "Reads join/filter recent posts from followed authors when the user opens feed.",
            writeCost: "Post creation is cheap because no follower timelines are pre-written.",
            timeline,
        }
    }

    /**
     * Logic — fanout-on-write: đọc timeline đã materialize sẵn (post ids).
     * Code — pushed.find → posts.find In(ids) giữ thứ tự sortOrder.
     * (EN Logic: Fanout-on-write — read pre-materialized timeline post ids.)
     * (EN Code: pushed.find → posts In(ids) preserve sortOrder.)
     */
    async getPushFeed(userId: string) {
        const entries = await this.pushed.find({
            where: { userId },
            order: { sortOrder: "ASC" },
        })
        const postIds = entries.map((row) => row.postId)
        const posts =
            postIds.length === 0
                ? []
                : await this.posts.find({ where: { id: In(postIds) } })
        const byId = new Map(posts.map((post) => [post.id, post]))
        const timeline = postIds
            .map((postId) => byId.get(postId))
            .filter((post): post is PostEntity => post !== undefined)
        return {
            model: "fanout-on-write",
            userId,
            materializedPostIds: postIds,
            readCost: "Reads are fast because the user timeline is already materialized.",
            writeCost: "Posting is expensive for authors with many followers.",
            timeline,
        }
    }

    /**
     * Logic — tạo post và fanout-on-write: thêm pushed_timeline cho từng follower.
     * Code — posts.save + follows.find followers → pushed.save sortOrder tăng.
     * (EN Logic: Create post and fanout-on-write into each follower timeline.)
     * (EN Code: posts.save + pushed.save per follower with sortOrder.)
     */
    async createPost(authorId: string, content: string) {
        const count = await this.posts.count()
        const post = {
            id: `post_${count + 1}`,
            authorId,
            content,
            createdAt: new Date().toISOString(),
        }
        await this.posts.save(post)
        const followers = await this.follows.find({ where: { authorId } })
        const followerIds = followers.map((row) => row.userId)
        let sortOrder = Date.now()
        for (const followerId of followerIds) {
            await this.pushed.save({ userId: followerId, postId: post.id, sortOrder })
            sortOrder += 1
        }
        return {
            model: "fanout-on-write",
            post,
            followerIds,
            fanoutWrites: followerIds.length,
        }
    }
}
