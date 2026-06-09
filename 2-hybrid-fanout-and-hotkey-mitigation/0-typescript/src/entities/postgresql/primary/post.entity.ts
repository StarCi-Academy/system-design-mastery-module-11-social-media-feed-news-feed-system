import {
    Column,
    Entity,
    PrimaryColumn,
} from "typeorm"

/**
 * Entity post — timeline hybrid (push regular + pull KOL).
 * (EN: Post entity — hybrid timeline rows in Postgres.)
 */
@Entity("posts")
export class HybridPostEntity {
    @PrimaryColumn()
    id!: string

    @Column()
    authorId!: string

    @Column()
    content!: string

    @Column()
    createdAt!: string
}
