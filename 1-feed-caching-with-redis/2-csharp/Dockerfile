FROM mcr.microsoft.com/dotnet/sdk:8.0 AS builder
WORKDIR /app
COPY FeedCacheService.csproj ./
RUN dotnet restore
COPY . ./
RUN dotnet publish -c Release -o /out

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=builder /out ./
EXPOSE 3000
ENTRYPOINT ["dotnet", "FeedCacheService.dll"]
