// Hybrid fanout + hotkey salting reference service (Spring Boot + Lettuce).
// Mirrors the canonical contract shared by all four language ports.
package com.starci.hybridfeed;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@SpringBootApplication
@RestController
public class HybridFeedApplication {

    private final JdbcTemplate jdbc;
    private final StringRedisTemplate redis;
    private final ObjectMapper mapper = new ObjectMapper();

    public HybridFeedApplication(JdbcTemplate jdbc, StringRedisTemplate redis) {
        this.jdbc = jdbc;
        this.redis = redis;
    }

    public static void main(String[] args) {
        SpringApplication.run(HybridFeedApplication.class, args);
    }

    /**
     * Logic — create schema tables and seed demo rows when empty.
     * Code — PostConstruct → JdbcTemplate DDL + INSERT when posts count is 0.
     * (EN Logic: Initialize schema and seed on startup.)
     * (EN Code: JdbcTemplate DDL + conditional INSERT.)
     */
    @PostConstruct
    public void initSchema() {
        jdbc.execute("CREATE TABLE IF NOT EXISTS authors (id TEXT PRIMARY KEY, \"isCelebrity\" BOOLEAN NOT NULL DEFAULT false)");
        jdbc.execute("CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, \"authorId\" TEXT NOT NULL, content TEXT NOT NULL, \"createdAt\" TEXT NOT NULL)");
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM posts", Integer.class);
        if (count != null && count == 0) {
            jdbc.update("INSERT INTO authors (id, \"isCelebrity\") VALUES (?, ?), (?, ?)",
                    "author_1", false, "kol_1", true);
            jdbc.update("INSERT INTO posts (id, \"authorId\", content, \"createdAt\") VALUES (?,?,?,?)",
                    "post_201", "author_1", "Regular author post was pushed into the user feed.", "2026-05-20T08:30:00.000Z");
            jdbc.update("INSERT INTO posts (id, \"authorId\", content, \"createdAt\") VALUES (?,?,?,?)",
                    "post_301", "kol_1", "KOL post is pulled and merged at read time.", "2026-05-20T09:30:00.000Z");
        }
    }

    /**
     * Logic — key salting: spread KOL hotkey across 4 salt slots.
     * Code — last char of userId mod 4 → feed:kol:{author}:salt:N.
     * (EN Logic: Salt KOL keys to distribute hotkey load across 4 slots.)
     * (EN Code: Last userId char code modulo 4 → deterministic salt slot.)
     */
    // Spread the KOL hotkey across 4 salt slots using the last character of userId.
    private String saltedKolKey(String authorId, String userId) {
        int salt = userId.isEmpty() ? 0 : userId.charAt(userId.length() - 1) % 4;
        return "feed:kol:" + authorId + ":salt:" + salt;
    }

    /** Logic — health check endpoint. Code — returns {"status":"ok"}. */
    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }

    /**
     * Logic — hybrid feed: merge push (regular) + KOL pull; cache KOL with key salting.
     * Code — JdbcTemplate query authors + posts → split pushed/celebrity → SET salted key → sort createdAt DESC.
     * (EN Logic: Merge push timeline with KOL pull timeline; cache under salted key EX 60.)
     * (EN Code: JdbcTemplate → split → StringSetAsync → sort.)
     */
    @GetMapping("/api/feed/hybrid")
    public Map<String, Object> getHybridFeed(@RequestParam(defaultValue = "usr_1") String userId) throws Exception {
        // Read all authors; split into celebrity (KOL) and regular sets.
        List<Map<String, Object>> authors = jdbc.queryForList("SELECT id, \"isCelebrity\" FROM authors");
        Set<String> celebritySet = new HashSet<>();
        List<String> celebrityIds = new ArrayList<>();
        for (Map<String, Object> a : authors) {
            // isCelebrity flag drives routing: true = pull-at-read, false = push-to-followers.
            if (Boolean.TRUE.equals(a.get("isCelebrity"))) {
                celebritySet.add((String) a.get("id"));
                celebrityIds.add((String) a.get("id"));
            }
        }

        // Load all posts; split into push (regular) path and pull (celebrity) path.
        List<Map<String, Object>> posts = jdbc.queryForList(
                "SELECT id, \"authorId\", content, \"createdAt\" FROM posts");
        List<Map<String, Object>> pushed = new ArrayList<>();
        List<Map<String, Object>> celebrityPosts = new ArrayList<>();
        for (Map<String, Object> p : posts) {
            // Push path: regular authors. Pull path: celebrity authors.
            if (celebritySet.contains(p.get("authorId"))) celebrityPosts.add(p);
            else pushed.add(p);
        }

        // Cache the KOL timeline under a salted key (EX 60) — hotkey mitigation.
        String saltedKey = saltedKolKey("kol_1", userId);
        redis.opsForValue().set(saltedKey, mapper.writeValueAsString(celebrityPosts), Duration.ofSeconds(60));

        // Merge both sources and sort by createdAt descending (newest first).
        List<Map<String, Object>> timeline = new ArrayList<>(pushed);
        timeline.addAll(celebrityPosts);
        timeline.sort((x, y) -> ((String) y.get("createdAt")).compareTo((String) x.get("createdAt")));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", "hybrid-fanout");
        body.put("userId", userId);
        body.put("strategy", Map.of("regularUsers", "fanout-on-write", "celebrityUsers", "fanout-on-read"));
        body.put("hotkeyMitigation", Map.of(
                "technique", "key-salting",
                "saltedKey", saltedKey,
                "reason", "KOL post cache is duplicated across salted keys so one Redis key does not absorb all reads."));
        body.put("celebrityAuthors", celebrityIds);
        body.put("timeline", timeline);
        return body;
    }

    /**
     * Logic — route post: KOL uses pull-at-read-time, regular users push-to-followers.
     * Code — JdbcTemplate findOne isCelebrity → branch metadata.
     * (EN Logic: Route post — celebrities pull-at-read, regular users push-to-followers.)
     * (EN Code: JdbcTemplate findOne → isCelebrity branch.)
     */
    @GetMapping("/api/feed/hybrid/route")
    public Map<String, Object> routePost(@RequestParam(defaultValue = "kol_1") String authorId) {
        // Look up the author's celebrity flag from Postgres to decide routing strategy.
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT \"isCelebrity\" FROM authors WHERE id = ?", authorId);
        boolean isCelebrity = !rows.isEmpty() && Boolean.TRUE.equals(rows.get(0).get("isCelebrity"));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("authorId", authorId);
        body.put("isCelebrity", isCelebrity);
        // Celebrities are pulled at read time (1 write); regular users are
        // pushed to every follower (writes proportional to follower count).
        body.put("route", isCelebrity ? "pull-at-read-time" : "push-to-followers");
        // expectedWrites quantifies write amplification for each route.
        body.put("expectedWrites", isCelebrity ? 1 : "number_of_followers");
        return body;
    }
}
