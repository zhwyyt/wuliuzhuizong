import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DataService } from './data.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [DataService, RealtimeGateway],
})
export class AppModule {}
