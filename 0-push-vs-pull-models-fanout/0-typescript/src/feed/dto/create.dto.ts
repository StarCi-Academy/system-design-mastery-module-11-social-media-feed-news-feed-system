import {
    IsOptional,
    IsString,
} from "class-validator"

/**
 * DTO tạo post cho demo fanout-on-write.
 * (EN: DTO for creating a post in fanout-on-write demo.)
 */
export class CreateFeedDto {
    /**
     * Logic — author tạo post (mặc định author_1 nếu bỏ trống).
     * (EN Logic: Post author id (defaults to author_1).)
     */
    @IsOptional()
    @IsString()
    authorId?: string

    /**
     * Logic — nội dung post.
     * (EN Logic: Post body text.)
     */
    @IsOptional()
    @IsString()
    content?: string
}
