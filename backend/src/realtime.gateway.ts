import { Injectable } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { LatestLocation } from './domain';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: '/realtime',
})
export class RealtimeGateway {
  @WebSocketServer()
  server?: Server;

  publishLocation(point: LatestLocation) {
    this.server?.emit('location:update', point);
  }
}
