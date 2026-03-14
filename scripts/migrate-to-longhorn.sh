#!/bin/bash
set -euo pipefail

# Migrates all app data from hostPath PVs to Longhorn PVCs.
# Run AFTER pushing the PVC changes to Git and Flux has reconciled.
# All Longhorn PVCs must exist and be Bound before running this.

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()    { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()     { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# --- Preflight checks ---

info "Checking all Longhorn PVCs are Bound..."
PVCS=(
  foundry-data-claim
  donetick-data-claim
  paperless-data-claim
  paperless-media-claim
  paperless-consume-claim
  paperless-postgres-claim
  paperless-redis-claim
  satisfactory-claim
)
for pvc in "${PVCS[@]}"; do
  status=$(kubectl get pvc "$pvc" -n default -o jsonpath='{.status.phase}' 2>/dev/null || echo "NOT_FOUND")
  if [[ "$status" != "Bound" ]]; then
    die "PVC $pvc is not Bound (status: $status). Wait for Flux to reconcile and Longhorn to provision it."
  fi
  info "  $pvc: Bound"
done

# --- Scale down all apps ---

info "Scaling down all deployments..."
kubectl scale deployment \
  foundry \
  donetick \
  paperless-web \
  paperless-worker \
  paperless-scheduler \
  paperless-postgres \
  paperless-redis \
  --replicas=0 -n default

info "Waiting for pods to terminate..."
kubectl wait --for=delete pod -l 'app in (foundry,donetick,paperless,paperless-postgres,paperless-redis)' \
  -n default --timeout=120s 2>/dev/null || true

# --- Migration function ---

migrate() {
  local name=$1
  local node=$2
  local src=$3
  local pvc=$4

  info "Migrating $name ($src -> $pvc)..."

  kubectl run "migrate-$name" --rm --attach --restart=Never --image=alpine \
    --overrides="$(cat <<EOF
{
  "spec": {
    "nodeSelector": {"kubernetes.io/hostname": "$node"},
    "containers": [{
      "name": "migrate",
      "image": "alpine",
      "command": ["sh", "-c", "cp -av /old/. /new/ && echo '=== DONE: $name ==='"],
      "volumeMounts": [
        {"name": "old", "mountPath": "/old"},
        {"name": "new", "mountPath": "/new"}
      ]
    }],
    "volumes": [
      {"name": "old", "hostPath": {"path": "$src"}},
      {"name": "new", "persistentVolumeClaim": {"claimName": "$pvc"}}
    ]
  }
}
EOF
)"
  info "$name migration complete."
}

# --- Migrate each app ---

migrate foundry      new-bermuda     /home/jack/foundrydata              foundry-data-claim
migrate donetick     new-bermuda     /home/jack/donetick/data            donetick-data-claim
migrate pl-data      new-bermuda     /home/jack/paperless/data           paperless-data-claim
migrate pl-media     new-bermuda     /home/jack/paperless/media          paperless-media-claim
migrate pl-consume   new-bermuda     /home/jack/paperless/consume        paperless-consume-claim
migrate pl-postgres  new-bermuda     /home/jack/paperless/postgres       paperless-postgres-claim
migrate pl-redis     new-bermuda     /home/jack/paperless/redis          paperless-redis-claim
migrate satisfactory infinite-granite /home/jack/Applications/satisfactory satisfactory-claim

# --- Scale back up ---

info "Scaling all deployments back up..."
kubectl scale deployment \
  foundry \
  donetick \
  paperless-web \
  paperless-worker \
  paperless-scheduler \
  paperless-postgres \
  paperless-redis \
  --replicas=1 -n default

info "Waiting for pods to be ready..."
kubectl wait --for=condition=Available deployment \
  foundry donetick paperless-web paperless-postgres paperless-redis \
  -n default --timeout=120s

echo ""
info "All migrations complete. Verify your apps are working before deleting the old hostPath data."
warn "Old data still exists on disk — delete manually once verified:"
warn "  new-bermuda:     /home/jack/foundrydata, /home/jack/donetick, /home/jack/paperless"
warn "  infinite-granite: /home/jack/Applications/satisfactory"
