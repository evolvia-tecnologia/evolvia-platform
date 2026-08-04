import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';

@Module({
  imports: [JwtModule.register({ global: true, secret: process.env.JWT_SECRET, signOptions: { expiresIn: '7d' } })],
  controllers: [HealthController, AuthController, EventsController],
  providers: [PrismaService, AuthService, AuthGuard, EventsService],
})
export class AppModule {}
