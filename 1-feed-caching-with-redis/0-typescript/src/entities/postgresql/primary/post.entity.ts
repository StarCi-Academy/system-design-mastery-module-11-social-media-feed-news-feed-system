import {
    Column,
    Entity,
    PrimaryColumn,
} from "typeorm"

/**
 * Entity post — nguồn demo trước khi ZADD vào Redis ZSET.
 * (EN: Post entity — source rows before ZADD into Redis ZSET.)
 */
@Entity("posts")
export class CachedPostEntity {
    @PrimaryColumn()
    id!: string

    @Column()
    authorId!: string

    @Column()
    content!: string

    @Column({ type: "bigint" })
    scoreMs!: string
}
