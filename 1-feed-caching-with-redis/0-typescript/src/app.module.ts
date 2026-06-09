/**
 * Module gốc — Postgres biz demo + seed OnModuleInit + Redis.
 * (EN: Root module — Postgres demo data + OnModuleInit seed + Redis.)
 */
import {
    Module,
} from "@nestjs/common"
import {
    ConfigModule,
    ConfigService,
} from "@nestjs/config"
import {
    TypeOrmModule,
} from "@nestjs/typeorm"
import {
    appConfig,
    databaseConfig,
    type DatabaseConfig,
    redisConfig,
} from "./config"
import {
    FeedcacheModule,
} from "./feedcache"

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            load: [appConfig, databaseConfig, redisConfig],
        }),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                const db = config.getOrThrow<DatabaseConfig>("database")
                return {
                    type: "postgres" as const,
                    host: db.host,
                    port: db.port,
                    username: db.username,
                    password: db.password,
                    database: db.database,
                    autoLoadEntities: true,
                    synchronize: true,
                }
            },
        }),
        FeedcacheModule,
    ],
})
export class AppModule {}
