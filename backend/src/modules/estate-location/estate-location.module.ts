import { Module } from '@nestjs/common';
import { EstateLocationController, PublicEstateLocationController } from './estate-location.controller';
import { EstateLocationService } from './estate-location.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [AuditLogsModule, AlertsModule],
  controllers: [EstateLocationController, PublicEstateLocationController],
  providers: [EstateLocationService],
})
export class EstateLocationModule {}
