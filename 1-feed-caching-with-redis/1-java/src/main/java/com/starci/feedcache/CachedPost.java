package com.starci.feedcache;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Post entity — source rows before ZADD into Redis ZSET.
 */
@Entity
@Table(name = "posts")
public class CachedPost {
    @Id
    private String id;

    @Column(name = "author_id")
    private String authorId;

    @Column
    private String content;

    // Epoch milliseconds used as ZSET score; stored as bigint.
    @Column(name = "score_ms")
    private long scoreMs;

    public CachedPost() {
    }

    public CachedPost(String id, String authorId, String content, long scoreMs) {
        this.id = id;
        this.authorId = authorId;
        this.content = content;
        this.scoreMs = scoreMs;
    }

    public String getId() {
        return id;
    }

    public String getAuthorId() {
        return authorId;
    }

    public String getContent() {
        return content;
    }

    public long getScoreMs() {
        return scoreMs;
    }
}
