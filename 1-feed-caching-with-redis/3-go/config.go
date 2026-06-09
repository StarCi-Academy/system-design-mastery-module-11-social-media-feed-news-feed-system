package main

import (
	"fmt"
	"os"
)

// Config holds all runtime settings read from environment variables.
type Config struct {
	Port        string
	PostgresDSN string
	RedisAddr   string
}

// loadConfig reads environment variables in one place (config-layer).
func loadConfig() Config {
	pgHost := envOr("POSTGRES_HOST", "localhost")
	pgPort := envOr("POSTGRES_PORT", "5432")
	pgUser := envOr("POSTGRES_USER", "postgres")
	pgPass := envOr("POSTGRES_PASSWORD", "postgres")
	pgDB := envOr("POSTGRES_DB", "feed_cache_service")
	redisHost := envOr("REDIS_HOST", "localhost")
	redisPort := envOr("REDIS_PORT", "6379")

	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
		pgUser, pgPass, pgHost, pgPort, pgDB)

	return Config{
		Port:        envOr("PORT", "3000"),
		PostgresDSN: dsn,
		RedisAddr:   fmt.Sprintf("%s:%s", redisHost, redisPort),
	}
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
