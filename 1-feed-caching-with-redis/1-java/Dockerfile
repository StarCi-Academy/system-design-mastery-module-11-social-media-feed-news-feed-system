FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app
COPY pom.xml ./
RUN mvn -q dependency:go-offline
COPY src ./src
RUN mvn -q clean package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
ENV JAVA_OPTS=""
COPY --from=builder /app/target/feed-cache-service-1.0.0.jar app.jar
EXPOSE 3000
CMD ["java", "-jar", "app.jar"]
