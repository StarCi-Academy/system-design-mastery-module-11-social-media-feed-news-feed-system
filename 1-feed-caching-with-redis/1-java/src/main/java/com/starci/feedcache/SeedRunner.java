package com.starci.feedcache;

import java.util.List;

import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/**
 * Seed demo posts into Postgres on startup when the table is empty.
 */
@Component
public class SeedRunner implements CommandLineRunner {
    private final CachedPostRepository posts;

    public SeedRunner(CachedPostRepository posts) {
        this.posts = posts;
    }

    @Override
    public void run(String... args) {
        if (posts.count() > 0) {
            return;
        }
        long now = System.currentTimeMillis();
        posts.saveAll(List.of(
            new CachedPost("post_101", "author_1", "Cached post 101 — older timeline item.", now - 30_000),
            new CachedPost("post_102", "author_1", "Cached post 102 — mid timeline item.", now - 10_000),
            new CachedPost("post_103", "author_1", "Cached post 103 — newest timeline item.", now)
        ));
    }
}
