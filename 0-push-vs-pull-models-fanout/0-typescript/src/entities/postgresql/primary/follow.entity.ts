import {
    Entity,
    PrimaryColumn,
} from "typeorm"

/**
 * Entity follow — user theo dõi author (graph demo trong Postgres).
 * (EN: Follow entity — user follows author (demo graph in Postgres).)
 */
@Entity("follows")
export class FollowEntity {
    @PrimaryColumn()
    userId!: string

    @PrimaryColumn()
    authorId!: string
}
