package com.starci.feedcache;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * HTTP controller — Redis ZSET feed cache (seed / read).
 */
@RestController
@RequestMapping("/api/feed")
public class FeedCacheController {
    private final FeedCacheService service;

    public FeedCacheController(FeedCacheService service) {
        this.service = service;
    }

    @PostMapping("/cache/seed")
    public Map<String, Object> seedTimeline(@RequestParam(defaultValue = "usr_1") String userId) {
        return service.seedTimeline(userId);
    }

    @GetMapping("/cache")
    public Map<String, Object> getCachedFeed(@RequestParam(defaultValue = "usr_1") String userId) {
        return service.getCachedFeed(userId);
    }
}
