# Multi-stage build for the Go hybrid-feed-service.
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod ./
RUN go mod download || true
COPY . .
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -o /hybrid-feed-service .

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /hybrid-feed-service /app/hybrid-feed-service
EXPOSE 3000
CMD ["/app/hybrid-feed-service"]
