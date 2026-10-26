#!/usr/bin/env bash
# Runs ON the staging EC2 instance (via SSM Run Command, invoked by deploy-staging.sh). No SSH.
# Builds the backend image locally (arm64), (re)starts the app container and the Caddy HTTPS proxy.
# Usage: remote-deploy.sh <imageTag> <stagingHost> <buildBucket>
set -euo pipefail
TAG="$1"; HOST="$2"; BUCKET="$3"; REGION="us-east-1"
LOG_GROUP="/flacronai/staging/backend"; ROOT="/opt/flacron"; W="$ROOT/releases/$TAG"
ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-claude-opus-4-8}"

# First boot: user-data installs docker/unzip; wait for it (no-op on later deploys).
for i in $(seq 1 60); do command -v docker >/dev/null && command -v unzip >/dev/null && systemctl is-active --quiet docker && break; sleep 5; done
command -v docker >/dev/null || { echo "docker not installed (user-data failed?)"; exit 1; }
mkdir -p "$W"
aws s3 cp "s3://$BUCKET/src/$TAG.zip" "$W/src.zip" --region "$REGION" --only-show-errors
(cd "$W" && unzip -oq src.zip)
docker build -q -t "flacronai-backend:$TAG" "$W/backend" >/dev/null
docker network inspect fa >/dev/null 2>&1 || docker network create fa >/dev/null

# Secret JSON -> one env var, in a root-only file on tmpfs (/run). Removed right after the
# container is created; docker keeps the value only in its root-only container config.
ENVF="/run/flacron-app.env"; umask 077
printf 'APP_SECRETS_JSON=%s\n' "$(aws secretsmanager get-secret-value --secret-id flacronai/staging/app \
  --region "$REGION" --query SecretString --output text | tr -d '\r\n')" > "$ENVF"

docker rm -f app >/dev/null 2>&1 || true
docker run -d --name app --network fa --restart unless-stopped --memory 1536m \
  --env-file "$ENVF" \
  -e NODE_ENV=production -e PORT=3000 -e TRUST_PROXY_HOPS=1 \
  -e FRONTEND_URL=https://flacronai.com -e PUSH_NOTIFICATIONS_ENABLED=false \
  -e STORE_BILLING_ACCEPT_SANDBOX=true -e ANTHROPIC_MODEL="$ANTHROPIC_MODEL" \
  --log-driver awslogs --log-opt awslogs-region="$REGION" --log-opt awslogs-group="$LOG_GROUP" \
  --log-opt awslogs-stream=app \
  "flacronai-backend:$TAG" node deploy/staging/boot.js >/dev/null
rm -f "$ENVF"

# Caddy: automatic HTTPS (Let's Encrypt) for $HOST, reverse proxy to app:3000 (1 proxy hop).
# No proxy timeouts are set, so long exports/generation are not cut off.
printf '%s {\n\treverse_proxy app:3000\n}\n' "$HOST" > "$ROOT/Caddyfile"
if [ "$(docker inspect -f '{{.State.Running}}' caddy 2>/dev/null)" = "true" ]; then
  docker exec caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null
else
  docker rm -f caddy >/dev/null 2>&1 || true
  docker run -d --name caddy --network fa --restart unless-stopped -p 80:80 -p 443:443 \
    -v "$ROOT/Caddyfile:/etc/caddy/Caddyfile:ro" -v caddy_data:/data -v caddy_config:/config \
    --log-driver awslogs --log-opt awslogs-region="$REGION" --log-opt awslogs-group="$LOG_GROUP" \
    --log-opt awslogs-stream=caddy caddy:2.10 >/dev/null
fi

for i in $(seq 1 30); do
  if docker exec app node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "app healthy ($TAG)"; break; fi
  [ "$i" = 30 ] && { echo "app NOT healthy"; docker logs --tail 40 app 2>&1 | grep -viE 'key|secret|token' || true; exit 1; }
  sleep 4
done
# Keep the last 3 releases / images only (disk + cost hygiene).
ls -1dt "$ROOT"/releases/* | tail -n +4 | xargs -r rm -rf
docker image prune -af --filter "until=1h" >/dev/null 2>&1 || true
