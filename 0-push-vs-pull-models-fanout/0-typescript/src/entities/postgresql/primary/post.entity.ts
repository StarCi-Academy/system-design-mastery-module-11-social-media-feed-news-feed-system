import {
    Column,
    Entity,
    PrimaryColumn,
} from "typeorm"

/**
 * Entity post — nội dung feed demo lưu Postgres.
 * (EN: Post entity — feed content demo persisted in Postgres.)
 */
@Entity("posts")
export class PostEntity {
    @PrimaryColumn()
    id!: string

    @Column()
    authorId!: string

    @Column()
    content!: string

    @Column()
    createdAt!: string
}
