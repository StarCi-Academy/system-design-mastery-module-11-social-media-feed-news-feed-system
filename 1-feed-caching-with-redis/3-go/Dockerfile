FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY . ./
RUN go mod tidy && CGO_ENABLED=0 go build -o /feed-cache-service .

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /feed-cache-service ./feed-cache-service
EXPOSE 3000
CMD ["./feed-cache-service"]
