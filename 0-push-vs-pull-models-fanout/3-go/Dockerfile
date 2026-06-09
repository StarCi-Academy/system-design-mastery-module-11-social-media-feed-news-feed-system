# Multi-stage build for the Go feed-service (push vs pull fanout).
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod ./
RUN go mod download || true
COPY . .
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -o /feed-service .

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /feed-service /app/feed-service
EXPOSE 3000
CMD ["/app/feed-service"]
