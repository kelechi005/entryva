# TURN relay setup (coturn)

Needed for calls between two security officers who are both on
restrictive/cellular NAT — STUN alone (free, no server, already working)
only lets two peers discover their own public address; it can't relay
media when a direct connection between them isn't possible, which is
common on carrier networks. TURN is the fallback that relays the audio
through a server you control when that happens.

Officers on the same estate WiFi already work today without any of this
— this is specifically the "sometimes on cellular data" case.

## 1. Generate a shared secret

```bash
openssl rand -hex 32
```

Use the same value in two places — they must match exactly:
- `backend/.env` → `TURN_SECRET=<value>`
- `coturn/turnserver.conf` → `static-auth-secret=<value>`

Why a shared secret instead of a fixed username/password: the backend
mints a new, time-limited credential (default 1 hour) for every call via
`GET /api/realtime/ice-servers`, using this secret to sign it (see
`RealtimeService.buildIceServers`). Nothing permanent is ever sent to
the frontend or stored in the browser — a leaked credential is only
useful for an hour, and only for relaying, not for anything else on
your infrastructure.

## 2. Point it at a real server

`coturn` needs a public IP and a DNS name (a TURN server behind a NAT of
its own generally doesn't work well). On whatever VPS you're using:

1. In `coturn/turnserver.conf`, uncomment `external-ip` and set it to
   the server's actual public IP.
2. Open these on the host firewall (not just Docker — `coturn` runs with
   `network_mode: host`, so Docker isn't managing these ports itself):
   - `3478/udp` and `3478/tcp` (TURN signaling)
   - `49152-49452/udp` (the relay port range set in `turnserver.conf`)
3. Point a DNS A record at it, e.g. `turn.yourestate.com`.
4. Set `backend/.env` → `TURN_SERVER_HOST=turn.yourestate.com`.

`network_mode: host` is a Linux-only Docker feature — this won't run as
configured on Docker Desktop (Mac/Windows). Deploy the `coturn` service
on a Linux VPS/host, same as `postgres`/`backend` would be in production
anyway.

## 3. Bring it up

```bash
docker compose up -d coturn
```

## 4. Verify

Trickle ICE / TURN allocation can be checked with any WebRTC trickle-ice
tester, or simply: have two officers on two different cellular
connections (not the same WiFi) start a call. If audio connects, TURN is
working. `docker compose logs coturn` shows allocation attempts if it
isn't.

## Optional: TLS (`turns:`)

Some networks block plain UDP/TCP TURN but allow TLS on 443. If calls
still fail to connect after the above (rare, but happens on some
corporate/hotel networks), get a cert for the TURN domain (same
Let's Encrypt setup as everything else) and uncomment the
`tls-listening-port`/`cert`/`pkey` lines in `turnserver.conf`. Not
needed for a first deployment — add it only if you see that specific
failure pattern.
