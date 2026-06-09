package com.starci.feed;

import jakarta.annotation.PostConstruct;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Service comparing fanout-on-read (pull) and fanout-on-write (push) — Postgres.
 * Mirrors the canonical TypeScript reference contract.
 */
@Service
public class FeedService {

    private final PostRepository posts;
    private final FollowRepository follows;
    private final PushedTimelineRepository pushed;

    public FeedService(PostRepository posts, FollowRepository follows, PushedTimelineRepository pushed) {
        this.posts = posts;
        this.follows = follows;
        this.pushed = pushed;
    }

    /** Seed the demo graph when the database is empty. */
    @PostConstruct
    void seed() {
        if (posts.count() > 0) {
            return;
        }
        follows.save(newFollow("usr_1", "author_1"));
        follows.save(newFollow("usr_1", "kol_1"));
        follows.save(newFollow("usr_2", "author_1"));
        posts.save(newPost("post_1", "author_1", "Designing feeds starts with fanout trade-offs.", "2026-05-20T08:00:00.000Z"));
        posts.save(newPost("post_2", "kol_1", "KOL posts are usually pulled at read time.", "2026-05-20T09:00:00.000Z"));
        pushed.save(newPushed("usr_1", "post_1", 0));
        pushed.save(newPushed("usr_2", "post_1", 0));
    }

    /** Fanout-on-read: filter followed authors' posts at read time. */
    public Map<String, Object> getPullFeed(String userId) {
        List<String> followedAuthors = follows.findByUserId(userId).stream()
                .map(Follow::getAuthorId)
                .toList();
        List<Post> timeline = followedAuthors.isEmpty()
                ? List.of()
                : posts.findByAuthorIdInOrderByCreatedAtDesc(followedAuthors);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", "fanout-on-read");
        body.put("userId", userId);
        body.put("followedAuthors", followedAuthors);
        body.put("readCost", "Reads join/filter recent posts from followed authors when the user opens feed.");
        body.put("writeCost", "Post creation is cheap because no follower timelines are pre-written.");
        body.put("timeline", timeline);
        return body;
    }

    /** Fanout-on-write read: serve the pre-materialized timeline post ids. */
    public Map<String, Object> getPushFeed(String userId) {
        List<String> postIds = pushed.findByUserIdOrderBySortOrderAsc(userId).stream()
                .map(PushedTimeline::getPostId)
                .toList();
        Map<String, Post> byId = new HashMap<>();
        if (!postIds.isEmpty()) {
            for (Post p : posts.findByIdIn(postIds)) {
                byId.put(p.getId(), p);
            }
        }
        List<Post> timeline = new ArrayList<>();
        for (String id : postIds) {
            Post p = byId.get(id);
            if (p != null) {
                timeline.add(p);
            }
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", "fanout-on-write");
        body.put("userId", userId);
        body.put("materializedPostIds", postIds);
        body.put("readCost", "Reads are fast because the user timeline is already materialized.");
        body.put("writeCost", "Posting is expensive for authors with many followers.");
        body.put("timeline", timeline);
        return body;
    }

    /** Create a post and fanout-on-write into each follower timeline. */
    public Map<String, Object> createPost(String authorId, String content) {
        long count = posts.count();
        Post post = newPost("post_" + (count + 1), authorId, content, Instant.now().toString());
        posts.save(post);

        List<String> followerIds = follows.findByAuthorId(authorId).stream()
                .map(Follow::getUserId)
                .toList();
        long sortOrder = System.currentTimeMillis();
        for (String followerId : followerIds) {
            pushed.save(newPushed(followerId, post.getId(), sortOrder));
            sortOrder++;
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", "fanout-on-write");
        body.put("post", post);
        body.put("followerIds", followerIds);
        body.put("fanoutWrites", followerIds.size());
        return body;
    }

    private static Follow newFollow(String userId, String authorId) {
        Follow f = new Follow();
        f.setUserId(userId);
        f.setAuthorId(authorId);
        return f;
    }

    private static Post newPost(String id, String authorId, String content, String createdAt) {
        Post p = new Post();
        p.setId(id);
        p.setAuthorId(authorId);
        p.setContent(content);
        p.setCreatedAt(createdAt);
        return p;
    }

    private static PushedTimeline newPushed(String userId, String postId, long sortOrder) {
        PushedTimeline t = new PushedTimeline();
        t.setUserId(userId);
        t.setPostId(postId);
        t.setSortOrder(sortOrder);
        return t;
    }
}
