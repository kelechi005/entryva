import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { randomUUID } from 'crypto';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../../prisma/prisma.service';

interface CallJwtPayload {
  sub: string;
}

interface PresentOfficer {
  socketId: string;
  userId: string;
  displayName: string;
}

/**
 * Direct-call signaling for security officers — one estate's officers can
 * ring each other, same as the CreateResidentInviteDto flow is REST but
 * this one genuinely needs to be push-based (a ringing phone can't be
 * polled for).
 *
 * DELIBERATELY a thin relay: this gateway knows nothing about SDP offers,
 * answers, or ICE candidates — `call:signal` just forwards an opaque
 * payload from one authenticated socket to another. All WebRTC semantics
 * live in the frontend (useCallManager). That keeps the one part of the
 * app that's genuinely hard to test (browser WebRTC) out of the backend
 * entirely, and means adding e.g. video later needs zero gateway changes.
 *
 * SCALING NOTE: presence is held in-memory (per estate, per process). A
 * single Node instance is exactly right for now — the moment this runs
 * behind more than one backend instance, presence and relayed messages
 * both need to move to a shared adapter (the standard fix is Redis via
 * @nestjs/platform-socket.io's redisIoAdapter), since officer A and
 * officer B could otherwise land on different instances that can't see
 * each other's sockets.
 */
@Injectable()
@WebSocketGateway({
  namespace: '/calls',
  cors: {
    origin: (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean),
    credentials: true,
  },
})
export class CallsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(CallsGateway.name);
  private readonly jwtService = new JwtService({ secret: process.env.AUTH_SECRET });

  // estateId -> userId -> presence. A Map of Maps rather than one flat
  // map keyed by userId alone, so broadcasting "who's online" to one
  // estate's room never has to filter every connected officer across
  // every estate on the platform.
  private readonly presence = new Map<string, Map<string, PresentOfficer>>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The httpOnly access_token cookie (see JwtStrategy) is the only
   * credential this app issues, so the handshake is authenticated the
   * same way every REST request is — reading that cookie, not a
   * separate token scheme invented just for sockets.
   */
  async handleConnection(socket: Socket) {
    try {
      const token = this.extractAccessTokenCookie(socket.handshake.headers.cookie);
      if (!token) throw new Error('No access_token cookie present.');

      const payload = this.jwtService.verify<CallJwtPayload>(token);
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.status !== 'ACTIVE' || user.role !== 'SECURITY_OFFICER') {
        // Calling is officer-to-officer only for now — see the "should
        // admins be callable too" open question raised in conversation.
        throw new Error('Only active security officers can use the calling channel.');
      }

      const officer = await this.prisma.securityOfficerProfile.findUnique({ where: { userId: user.id } });
      if (!officer) throw new Error('No security officer profile found.');

      socket.data.userId = user.id;
      socket.data.estateId = officer.estateId;
      socket.data.displayName = officer.fullName;

      socket.join(this.estateRoom(officer.estateId));
      this.setPresence(officer.estateId, {
        socketId: socket.id,
        userId: user.id,
        displayName: officer.fullName,
      });
      this.broadcastPresence(officer.estateId);
    } catch (err) {
      this.logger.warn(`Rejected socket connection: ${(err as Error).message}`);
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    const estateId = socket.data.estateId as string | undefined;
    const userId = socket.data.userId as string | undefined;
    if (!estateId || !userId) return;

    // A disconnect mid-call (dropped network, app backgrounded) is
    // exactly the ambiguous case a walkie-talkie doesn't have — the
    // other party needs to be told the line went dead rather than sit
    // there thinking they're still connected.
    this.server.to(this.estateRoom(estateId)).emit('call:peer-disconnected', { userId });

    this.presence.get(estateId)?.delete(userId);
    this.broadcastPresence(estateId);
  }

  @SubscribeMessage('call:invite')
  handleInvite(@ConnectedSocket() socket: Socket, @MessageBody() body: { toUserId: string }) {
    const estateId = socket.data.estateId as string;
    const target = this.presence.get(estateId)?.get(body.toUserId);
    const fromUserId = socket.data.userId as string;

    if (!target) {
      socket.emit('call:unavailable', { toUserId: body.toUserId });
      return;
    }

    const callId = randomUUID();
    this.server.to(target.socketId).emit('call:incoming', {
      callId,
      fromUserId,
      fromName: socket.data.displayName,
    });
    socket.emit('call:ringing', { callId, toUserId: body.toUserId });
  }

  @SubscribeMessage('call:accept')
  handleAccept(@ConnectedSocket() socket: Socket, @MessageBody() body: { callId: string; toUserId: string }) {
    this.relayToUser(socket, body.toUserId, 'call:accepted', { callId: body.callId });
  }

  @SubscribeMessage('call:decline')
  handleDecline(@ConnectedSocket() socket: Socket, @MessageBody() body: { callId: string; toUserId: string }) {
    this.relayToUser(socket, body.toUserId, 'call:declined', { callId: body.callId });
  }

  @SubscribeMessage('call:cancel')
  handleCancel(@ConnectedSocket() socket: Socket, @MessageBody() body: { callId: string; toUserId: string }) {
    this.relayToUser(socket, body.toUserId, 'call:cancelled', { callId: body.callId });
  }

  @SubscribeMessage('call:hangup')
  handleHangup(@ConnectedSocket() socket: Socket, @MessageBody() body: { callId: string; toUserId: string }) {
    this.relayToUser(socket, body.toUserId, 'call:hangup', { callId: body.callId });
  }

  /**
   * Opaque WebRTC signaling relay — `data` is whatever the frontend's
   * RTCPeerConnection produced (an SDP offer/answer or an ICE candidate).
   * This gateway never inspects it, only routes it to the right socket.
   */
  @SubscribeMessage('call:signal')
  handleSignal(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { callId: string; toUserId: string; data: unknown },
  ) {
    this.relayToUser(socket, body.toUserId, 'call:signal', {
      callId: body.callId,
      fromUserId: socket.data.userId,
      data: body.data,
    });
  }

  /**
   * Called by MessagesController after a message is durably persisted,
   * to push it live to the recipient if they're currently connected --
   * the chat equivalent of call:incoming. If they're not online, this
   * is a no-op; they'll see it via GET /messages/thread/:userId next
   * time they open the app, same as any offline-delivery message system.
   */
  pushMessage(estateId: string, toUserId: string, message: object) {
    const target = this.presence.get(estateId)?.get(toUserId);
    if (target) this.server.to(target.socketId).emit('message:new', message);
  }

  private relayToUser(fromSocket: Socket, toUserId: string, event: string, payload: Record<string, unknown>) {
    const estateId = fromSocket.data.estateId as string;
    const target = this.presence.get(estateId)?.get(toUserId);
    if (!target) {
      fromSocket.emit('call:unavailable', { toUserId });
      return;
    }
    this.server.to(target.socketId).emit(event, { ...payload, fromUserId: fromSocket.data.userId });
  }

  private setPresence(estateId: string, officer: PresentOfficer) {
    if (!this.presence.has(estateId)) this.presence.set(estateId, new Map());
    this.presence.get(estateId)!.set(officer.userId, officer);
  }

  private broadcastPresence(estateId: string) {
    const officers = Array.from(this.presence.get(estateId)?.values() ?? []).map((o) => ({
      userId: o.userId,
      displayName: o.displayName,
    }));
    this.server.to(this.estateRoom(estateId)).emit('presence:update', officers);
  }

  private estateRoom(estateId: string): string {
    return `estate:${estateId}`;
  }

  private extractAccessTokenCookie(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(';')) {
      const [key, ...rest] = part.trim().split('=');
      if (key === 'access_token') return decodeURIComponent(rest.join('='));
    }
    return null;
  }
}
