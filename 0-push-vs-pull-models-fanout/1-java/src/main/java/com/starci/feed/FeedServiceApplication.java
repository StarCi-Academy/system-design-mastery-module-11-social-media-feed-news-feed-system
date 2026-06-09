package com.starci.feed;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Push vs pull fanout reference service (Spring Boot).
 * Postgres-only: follows / posts / pushed_timeline. Same contract as the
 * TypeScript / Go / C# ports.
 */
@SpringBootApplication
public class FeedServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(FeedServiceApplication.class, args);
    }
}
