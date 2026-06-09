/**
 * Module gốc — Postgres biz demo + seed OnModuleInit.
 * (EN: Root module — Postgres demo data + OnModuleInit seed.)
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
} from "./config"
import {
    FeedModule,
} from "./feed"

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            load: [appConfig, databaseConfig],
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
        FeedModule,
    ],
})
export class AppModule {}
