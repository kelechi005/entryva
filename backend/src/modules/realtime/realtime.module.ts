import { Module } from '@nestjs/common';
import { CallsGateway } from './calls.gateway';
import { RealtimeController } from './realtime.controller';
import { RealtimeService } from './realtime.service';

@Module({
  controllers: [RealtimeController],
  providers: [CallsGateway, RealtimeService],
})
export class RealtimeModule {}
