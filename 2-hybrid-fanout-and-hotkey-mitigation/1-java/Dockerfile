# Multi-stage build for the Spring Boot hybrid-feed-service.
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app
COPY pom.xml ./
RUN mvn -q dependency:go-offline || true
COPY src ./src
RUN mvn -q clean package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=builder /app/target/hybrid-feed-service-1.0.0.jar app.jar
EXPOSE 3000
ENTRYPOINT ["java", "-jar", "app.jar"]
