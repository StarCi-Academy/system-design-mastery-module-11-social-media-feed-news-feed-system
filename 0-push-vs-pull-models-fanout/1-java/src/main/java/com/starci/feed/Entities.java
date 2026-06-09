package com.starci.feed;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.util.Objects;

/**
 * JPA entities for the fanout demo. String ids mirror the canonical contract
 * (usr_1, author_1, post_1). The pushed_timeline table is the materialized
 * push timeline.
 */
final class Entities {
    private Entities() {
    }
}

/** Post row persisted in Postgres. */
@Entity
@Table(name = "posts")
class Post {
    @Id
    private String id;

    @Column(name = "authorId", nullable = false)
    private String authorId;

    @Column(nullable = false)
    private String content;

    @Column(name = "createdAt", nullable = false)
    private String createdAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getAuthorId() {
        return authorId;
    }

    public void setAuthorId(String authorId) {
        this.authorId = authorId;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(String createdAt) {
        this.createdAt = createdAt;
    }
}

/** Composite key for the follows table. */
class FollowId implements Serializable {
    private String userId;
    private String authorId;

    public FollowId() {
    }

    public FollowId(String userId, String authorId) {
        this.userId = userId;
        this.authorId = authorId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof FollowId that)) {
            return false;
        }
        return Objects.equals(userId, that.userId) && Objects.equals(authorId, that.authorId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(userId, authorId);
    }
}

/** Follow edge: a user follows an author. */
@Entity
@Table(name = "follows")
@IdClass(FollowId.class)
class Follow {
    @Id
    @Column(name = "userId")
    private String userId;

    @Id
    @Column(name = "authorId")
    private String authorId;

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getAuthorId() {
        return authorId;
    }

    public void setAuthorId(String authorId) {
        this.authorId = authorId;
    }
}

/** Composite key for the pushed_timeline table. */
class PushedTimelineId implements Serializable {
    private String userId;
    private String postId;

    public PushedTimelineId() {
    }

    public PushedTimelineId(String userId, String postId) {
        this.userId = userId;
        this.postId = postId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof PushedTimelineId that)) {
            return false;
        }
        return Objects.equals(userId, that.userId) && Objects.equals(postId, that.postId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(userId, postId);
    }
}

/** Materialized push timeline entry: a post id pre-written for a user. */
@Entity
@Table(name = "pushed_timeline")
@IdClass(PushedTimelineId.class)
class PushedTimeline {
    @Id
    @Column(name = "userId")
    private String userId;

    @Id
    @Column(name = "postId")
    private String postId;

    @Column(name = "sortOrder", nullable = false)
    private long sortOrder;

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getPostId() {
        return postId;
    }

    public void setPostId(String postId) {
        this.postId = postId;
    }

    public long getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(long sortOrder) {
        this.sortOrder = sortOrder;
    }
}
