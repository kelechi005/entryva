import { Module } from '@nestjs/common';
import { EstateLocationController, PublicEstateLocationController } from './estate-location.controller';
import { EstateLocationService } from './estate-location.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [AuditLogsModule],
  controllers: [EstateLocationController, PublicEstateLocationController],
  providers: [EstateLocationService],
})
export class EstateLocationModule {}
