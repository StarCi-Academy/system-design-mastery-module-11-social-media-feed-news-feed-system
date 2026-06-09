import {
    Column,
    Entity,
    PrimaryColumn,
} from "typeorm"

/**
 * Entity author — phân biệt user thường vs KOL (hybrid routing).
 * (EN: Author entity — regular user vs celebrity for hybrid routing.)
 */
@Entity("authors")
export class AuthorEntity {
    @PrimaryColumn()
    id!: string

    @Column({ default: false })
    isCelebrity!: boolean
}
