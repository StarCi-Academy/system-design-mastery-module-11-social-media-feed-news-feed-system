package com.starci.feed;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Spring Data JPA repositories backing the fanout demo. */
interface PostRepository extends JpaRepository<Post, String> {
    List<Post> findByAuthorIdInOrderByCreatedAtDesc(List<String> authorIds);

    List<Post> findByIdIn(List<String> ids);
}

interface FollowRepository extends JpaRepository<Follow, FollowId> {
    List<Follow> findByUserId(String userId);

    List<Follow> findByAuthorId(String authorId);
}

interface PushedTimelineRepository extends JpaRepository<PushedTimeline, PushedTimelineId> {
    List<PushedTimeline> findByUserIdOrderBySortOrderAsc(String userId);
}
