import { Module } from '@nestjs/common';
import { OfflineSyncController } from './offline-sync.controller';
import { OfflineSyncService } from './offline-sync.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { EntryExitModule } from '../entry-exit/entry-exit.module';

@Module({
  imports: [AuditLogsModule, EntryExitModule],
  controllers: [OfflineSyncController],
  providers: [OfflineSyncService],
  exports: [OfflineSyncService],
})
export class OfflineSyncModule {}
