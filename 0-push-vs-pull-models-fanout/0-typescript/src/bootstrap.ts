/**
 * Bootstrap Nest HTTP/microservice — ValidationPipe + listen.
 * (EN: Nest bootstrap — ValidationPipe and listen.)
 */
import {
    NestFactory,
} from "@nestjs/core"
import {
    ValidationPipe,
} from "@nestjs/common"
import {
    ConfigService,
} from "@nestjs/config"
import {
    AppModule,
} from "./app.module"

/**
 * Khởi tạo Nest app — ValidationPipe toàn cục và lắng nghe cổng.
 * (EN: Bootstrap Nest app — global ValidationPipe and listen on port.)
 */
export async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule)
    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        forbidUnknownValues: false,
    }))
    const configService = app.get(ConfigService)
    const port = configService.get<number>("app.port") ?? 3000
    // Cổng: ConfigService namespace app.port (từ app.config.ts).
    // (EN: Port from ConfigService app.port (via app.config.ts).)
    await app.listen(port, "0.0.0.0")
}
