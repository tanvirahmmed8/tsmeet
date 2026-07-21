# Production media and TURN networking

Use separate DNS names so web HTTPS and TURN/TLS can be routed independently:

- `meet.example.com` — Next.js
- `api.example.com` — Express and authenticated LiveKit webhooks
- `media.example.com` — LiveKit WebSocket/API on TLS
- `turn.example.com` — embedded TURN on UDP 3478 and TLS 443
- `storage.example.com` — authenticated/private MinIO gateway only

`turn.example.com` should resolve to a dedicated public IP when the web proxy also
needs TCP 443. LiveKit advertises its detected public address with
`rtc.use_external_ip: true`; do not put media UDP behind an HTTP reverse proxy.

## Certificates

Issue trusted certificates on the media and TURN hosts with an ACME client such as
Certbot. Copy `infrastructure/livekit/livekit.production.example.yaml` to the
ignored `livekit.production.yaml`, replace the domains, and mount `/etc/letsencrypt`
read-only as shown in `docker-compose.production.yml`.

Install the repository-owned automatic renewal timer on each certificate host:

```bash
sudo chmod 0755 /opt/tsmeet/infrastructure/certbot/reload-livekit.sh
sudo cp /opt/tsmeet/infrastructure/systemd/tsmeet-certbot-renew.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tsmeet-certbot-renew.timer
systemctl list-timers tsmeet-certbot-renew.timer
```

The persistent timer runs twice daily with a randomized delay. Certbot renews only
when necessary, and its deploy hook sends LiveKit `SIGHUP` only after a successful
renewal. Validate staging before production with:

```bash
sudo certbot renew --dry-run --run-deploy-hooks
sudo systemctl start tsmeet-certbot-renew.service
sudo journalctl -u tsmeet-certbot-renew.service --since today
```

## Firewall

Allow inbound traffic only for:

```text
TCP 80,443          web/ACME and TURN/TLS (on their respective IPs)
TCP 7881            LiveKit ICE/TCP fallback
UDP 3478            TURN/UDP
UDP 50000-60000     LiveKit WebRTC media
TCP 22              restricted administration source addresses only
```

Do not expose Redis, MySQL, MinIO, Egress health, or Docker daemon ports publicly.

## Credential rotation

1. Add a new LiveKit API key/secret alongside the old key in the secret store.
2. Restart LiveKit, Egress, and Express with both keys accepted by LiveKit.
3. Switch Express and Egress to issue/use the new key.
4. Wait longer than the five-minute participant token TTL.
5. Remove the old key and restart the three services.

Embedded TURN credentials are derived from short-lived LiveKit participant tokens;
rotating LiveKit keys and expiring existing tokens rotates TURN authorization too.

## Required tests

Run these from an external mobile network and a restrictive corporate network:

1. Normal UDP meeting and screen share.
2. Block direct UDP except TURN 3478 and confirm relay candidates.
3. Block UDP entirely and confirm `turns:turn.example.com:443?transport=tcp` fallback.
4. Renew the certificate in staging and reconnect without browser warnings.
5. Confirm browser ICE candidates contain no public Google STUN/TURN service.

Record packet captures, selected ICE candidate type (`relay` for TURN-only), browser,
network, date, and result. These tests require the real production DNS/IP and cannot
be proven from local static configuration.
