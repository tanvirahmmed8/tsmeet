#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/tsmeet}"
cd "${PROJECT_DIR}"

./deploy/configure-app.sh
./deploy/dc config --quiet
./deploy/dc pull
./deploy/dc build --pull backend frontend
./deploy/dc up -d mysql redis minio

echo "Waiting for database and cache health checks..."
for service in mysql redis minio; do
  container_id="$(./deploy/dc ps -q "${service}")"
  [[ -n "${container_id}" ]] || { echo "${service} container was not created."; exit 1; }
  for _ in $(seq 1 60); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}")"
    [[ "${status}" == "healthy" ]] && break
    [[ "${status}" == "unhealthy" || "${status}" == "exited" ]] && { echo "${service} is ${status}."; ./deploy/dc logs --tail=100 "${service}"; exit 1; }
    sleep 2
  done
  [[ "${status}" == "healthy" ]] || { echo "Timed out waiting for ${service}."; exit 1; }
done

./deploy/dc up -d livekit
livekit_id="$(./deploy/dc ps -q livekit)"
for _ in $(seq 1 60); do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${livekit_id}")"
  [[ "${status}" == "healthy" ]] && break
  [[ "${status}" == "unhealthy" || "${status}" == "exited" ]] && { ./deploy/dc logs --tail=100 livekit; exit 1; }
  sleep 2
done
[[ "${status}" == "healthy" ]] || { echo "Timed out waiting for LiveKit."; exit 1; }

./deploy/dc up -d
./deploy/dc ps

curl --fail --retry 20 --retry-delay 3 http://127.0.0.1:3002/api/health
curl --fail --retry 20 --retry-delay 3 http://127.0.0.1:9100/minio/health/live
curl --fail --retry 20 --retry-delay 3 http://127.0.0.1:3001 >/dev/null
echo "TSMeet deployment completed. Configure Nginx/Certbot, then enable TURN."
