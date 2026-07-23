# Optional Docker Profiles for a Low-Resource VPS

The default TSMeet deployment is intentionally lightweight. Recording and the full monitoring/logging stack are saved for later and do not start unless their Docker Compose profile is explicitly enabled.

## Default lightweight stack

Run:

```bash
./deploy/dc up -d
./deploy/dc ps
```

This starts five long-running services:

1. `frontend` — Next.js UI
2. `backend` — Node.js API and Socket.IO
3. `mysql` — application database
4. `redis` — signaling and LiveKit coordination
5. `livekit` — SFU media server and embedded TURN

It does **not** start MinIO, MinIO initialization, LiveKit Egress, Prometheus, Grafana, Loki, Promtail, cAdvisor, or exporters.

For a very small server, keep meetings small, use adaptive/low-resolution video, configure swap as an emergency buffer, and watch host memory with `docker stats`. Swap prevents some abrupt out-of-memory failures but does not provide usable CPU or RAM capacity.

## Recording profile — enable later

The `recording` profile contains:

- `minio`
- `minio-init` (one-shot bucket setup)
- `egress`

Room-composite recording is CPU- and memory-intensive. Do not enable it on a 1 vCPU / 1 GB server. Upgrade the VPS or move Egress to another server first.

After upgrading capacity:

```bash
./deploy/dc --profile recording pull
./deploy/dc --profile recording up -d
./deploy/dc --profile recording ps
./deploy/dc --profile recording logs --tail=100 minio egress
```

To stop recording services without deleting recordings:

```bash
./deploy/dc --profile recording stop egress minio
```

Do not use `down -v`; that would delete named volumes, including recording and database data.

## Observability profile — enable later

The `observability` profile contains:

- Prometheus and Grafana
- Loki and Promtail
- cAdvisor and Node Exporter
- MySQL Exporter and Redis Exporter

Enable it after the server has enough spare memory:

```bash
./deploy/dc --profile observability pull
./deploy/dc --profile observability up -d
./deploy/dc --profile observability ps
```

Access Grafana through an SSH tunnel because it remains bound to localhost:

```bash
ssh -L 3003:127.0.0.1:3003 YOUR_USER@YOUR_VPS_IP
```

Then open `http://localhost:3003` on your computer.

## Enable both profiles

On a larger server:

```bash
./deploy/dc --profile recording --profile observability up -d
```

## Return to lightweight mode

Stop optional services while preserving all volumes:

```bash
./deploy/dc --profile recording --profile observability stop \
  egress minio prometheus grafana loki promtail cadvisor \
  node-exporter mysql-exporter redis-exporter
```

Then confirm only the core stack is running:

```bash
./deploy/dc ps
docker stats --no-stream
```

