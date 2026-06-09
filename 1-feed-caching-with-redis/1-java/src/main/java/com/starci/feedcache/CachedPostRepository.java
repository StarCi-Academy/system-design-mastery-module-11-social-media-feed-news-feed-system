package com.starci.feedcache;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * JPA repository — read demo posts ordered by score for ZSET materialization.
 */
public interface CachedPostRepository extends JpaRepository<CachedPost, String> {
    List<CachedPost> findAllByOrderByScoreMsAsc();
}
