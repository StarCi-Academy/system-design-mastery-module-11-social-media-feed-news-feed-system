# Multi-stage build for the Java feed-service (Spring Boot).
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app
COPY pom.xml ./
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B clean package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=builder /app/target/feed-service-1.0.0.jar /app/feed-service.jar
EXPOSE 3000
CMD ["java", "-jar", "/app/feed-service.jar"]
