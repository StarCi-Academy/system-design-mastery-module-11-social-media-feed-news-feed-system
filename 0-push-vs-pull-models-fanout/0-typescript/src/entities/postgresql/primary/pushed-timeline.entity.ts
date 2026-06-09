import {
    Column,
    Entity,
    PrimaryColumn,
} from "typeorm"

/**
 * Entity timeline push — post id đã materialize cho từng user.
 * (EN: Pushed timeline entry — materialized post id per user.)
 */
@Entity("pushed_timeline")
export class PushedTimelineEntity {
    @PrimaryColumn()
    userId!: string

    @PrimaryColumn()
    postId!: string

    @Column({ default: 0 })
    sortOrder!: number
}
