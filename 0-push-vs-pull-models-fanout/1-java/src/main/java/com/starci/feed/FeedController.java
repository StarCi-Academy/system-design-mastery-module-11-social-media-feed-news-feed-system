package com.starci.feed;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** HTTP controller — compare fanout pull vs push. */
@RestController
@RequestMapping("/api/feed")
public class FeedController {

    private final FeedService service;

    public FeedController(FeedService service) {
        this.service = service;
    }

    /** GET /api/feed/pull — fanout-on-read for userId. */
    @GetMapping("/pull")
    public Map<String, Object> getPullFeed(@RequestParam(defaultValue = "usr_1") String userId) {
        return service.getPullFeed(userId);
    }

    /** GET /api/feed/push — fanout-on-write materialized timeline. */
    @GetMapping("/push")
    public Map<String, Object> getPushFeed(@RequestParam(defaultValue = "usr_1") String userId) {
        return service.getPushFeed(userId);
    }

    /** POST /api/feed/post — create a post and fanout to followers. */
    @PostMapping("/post")
    public ResponseEntity<Map<String, Object>> createPost(@RequestBody(required = false) CreatePostRequest body) {
        String authorId = body != null && body.authorId() != null ? body.authorId() : "author_1";
        String content = body != null && body.content() != null ? body.content() : "New post from feed-service";
        return ResponseEntity.status(HttpStatus.CREATED).body(service.createPost(authorId, content));
    }

    /** Request payload for creating a post; both fields are optional. */
    public record CreatePostRequest(String authorId, String content) {
    }
}
