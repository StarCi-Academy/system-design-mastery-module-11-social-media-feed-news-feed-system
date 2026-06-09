package com.starci.feedcache;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Spring Boot entrypoint — Postgres source + Redis ZSET feed cache.
 */
@SpringBootApplication
public class FeedCacheApplication {
    public static void main(String[] args) {
        SpringApplication.run(FeedCacheApplication.class, args);
    }
}
