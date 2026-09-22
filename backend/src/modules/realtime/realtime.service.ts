import { Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
import type { AuthenticatedUser } from '../auth/auth.types';

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * Builds the ICE server list handed to the frontend's RTCPeerConnection.
 * STUN is free and static — same public server for everyone, no
 * credential needed. TURN is different: it's a server *we* run and pay
 * relay bandwidth for, so a credential is required, and that credential
 * is short-lived (TURN_CREDENTIAL_TTL_SECONDS, default 1h) rather than a
 * fixed username/password baked into the frontend bundle — anyone could
 * read a bundled credential out of the JS, and it'd never expire on its
 * own. This follows the same "TURN REST API" time-limited-credential
 * scheme coturn implements natively (see coturn/turnserver.conf's
 * use-auth-secret) — the shared secret (TURN_SECRET) never leaves this
 * server; only the derived, expiring username/password pair does.
 */
@Injectable()
export class RealtimeService {
  buildIceServers(user: AuthenticatedUser): { iceServers: IceServerConfig[] } {
    const iceServers: IceServerConfig[] = [{ urls: 'stun:stun.l.google.com:19302' }];

    const host = process.env.TURN_SERVER_HOST;
    const secret = process.env.TURN_SECRET;
    if (!host || !secret) {
      // Not configured yet — STUN-only is a safe, valid fallback (see
      // .env.example): calls between officers on the same network still
      // work, only the cellular-NAT case is unavailable until this is set.
      return { iceServers };
    }

    const ttl = Number(process.env.TURN_CREDENTIAL_TTL_SECONDS ?? 3600);
    const expiresAt = Math.floor(Date.now() / 1000) + ttl;
    // userId in the username (not just a timestamp) means a leaked
    // credential is traceable to who it was issued for, same spirit as
    // every other audit-logged action in this app.
    const username = `${expiresAt}:${user.userId}`;
    const credential = createHmac('sha1', secret).update(username).digest('base64');

    iceServers.push({
      urls: [`turn:${host}:3478?transport=udp`, `turn:${host}:3478?transport=tcp`],
      username,
      credential,
    });

    return { iceServers };
  }
}
