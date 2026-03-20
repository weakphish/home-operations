# K8s Workload Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden all Flux-managed K8s workloads with security contexts, readiness probes, scoped RBAC, per-app network policies, and pre-commit manifest validation.

**Architecture:** All changes are declarative YAML edits to existing Flux app manifests. Network policies follow a default-deny-all baseline with explicit per-app allow rules. No new Flux HelmReleases or external dependencies are introduced.

**Tech Stack:** Kubernetes NetworkPolicy, Flux CD Kustomize, pre-commit framework, bash

---

## Chunk 1: Per-App Container Hardening

### Task 1: Homepage — imagePullPolicy, security context, readiness probe, RBAC

**Files:**
- Modify: `flux/apps/homepage/deployment.yaml`
- Modify: `flux/apps/homepage/rbac.yaml`

#### deployment.yaml changes

- [ ] **Step 1: Change imagePullPolicy**

In `flux/apps/homepage/deployment.yaml` line 25, change:
```yaml
          imagePullPolicy: Always
```
to:
```yaml
          imagePullPolicy: IfNotPresent
```

- [ ] **Step 2: Add security context and readiness probe**

After the closing `}` of `resources` (after line 43), add:
```yaml
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
            failureThreshold: 3
```

- [ ] **Step 3: Validate deployment.yaml**

```bash
kubectl apply --dry-run=client -f flux/apps/homepage/deployment.yaml
```
Expected: `deployment.apps/homepage configured (dry run)`

#### rbac.yaml changes — split ClusterRole into cluster-scoped + namespace-scoped

The current ClusterRole gives cluster-wide access to namespace-scoped resources (pods, ingresses). Split into:
- ClusterRole: only truly cluster-scoped resources (nodes, namespaces, metrics)
- Role (default namespace): namespace-scoped resources (pods, services, ingresses, deployments)

- [ ] **Step 4: Rewrite rbac.yaml**

Replace the entire contents of `flux/apps/homepage/rbac.yaml` with:
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: homepage
  namespace: default
  labels:
    app.kubernetes.io/name: homepage
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: homepage
  labels:
    app.kubernetes.io/name: homepage
rules:
  - apiGroups: [""]
    resources: [nodes, namespaces]
    verbs: [get, list]
  - apiGroups: [metrics.k8s.io]
    resources: [nodes, pods]
    verbs: [get, list]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: homepage
  labels:
    app.kubernetes.io/name: homepage
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: homepage
subjects:
  - kind: ServiceAccount
    name: homepage
    namespace: default
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: homepage
  namespace: default
  labels:
    app.kubernetes.io/name: homepage
rules:
  - apiGroups: [""]
    resources: [pods, services]
    verbs: [get, list]
  - apiGroups: [networking.k8s.io]
    resources: [ingresses]
    verbs: [get, list]
  - apiGroups: [apps]
    resources: [deployments]
    verbs: [get, list]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: homepage
  namespace: default
  labels:
    app.kubernetes.io/name: homepage
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: homepage
subjects:
  - kind: ServiceAccount
    name: homepage
    namespace: default
```

- [ ] **Step 5: Validate rbac.yaml**

```bash
kubectl apply --dry-run=client -f flux/apps/homepage/rbac.yaml
```
Expected: 5 resources created/configured (dry run)

- [ ] **Step 6: Commit**

```bash
git add flux/apps/homepage/deployment.yaml flux/apps/homepage/rbac.yaml
git commit -m "feat(homepage): add security context, readiness probe, scope RBAC to namespace"
```

---

### Task 2: Foundry — security context + readiness probe

**Files:**
- Modify: `flux/apps/foundry/deployment.yaml`

Foundry takes ~60s to start (downloads assets on first run). Use generous initialDelaySeconds.

- [ ] **Step 1: Add security context and readiness probe**

After `limits` block (after line 47), add:
```yaml
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
          readinessProbe:
            httpGet:
              path: /
              port: 30000
            initialDelaySeconds: 60
            periodSeconds: 15
            failureThreshold: 5
```

- [ ] **Step 2: Validate**

```bash
kubectl apply --dry-run=client -f flux/apps/foundry/deployment.yaml
```
Expected: `deployment.apps/foundry configured (dry run)`

- [ ] **Step 3: Commit**

```bash
git add flux/apps/foundry/deployment.yaml
git commit -m "feat(foundry): add security context and readiness probe"
```

---

### Task 3: Donetick — security context + readiness probe

**Files:**
- Modify: `flux/apps/donetick/deployment.yaml`

Donetick already has `startupProbe` and `livenessProbe`. Add a `readinessProbe` and security context.

- [ ] **Step 1: Add security context and readiness probe**

After `limits` block (after line 49), add:
```yaml
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
          readinessProbe:
            httpGet: { path: /, port: 2021 }
            initialDelaySeconds: 5
            periodSeconds: 10
            failureThreshold: 3
```

- [ ] **Step 2: Validate**

```bash
kubectl apply --dry-run=client -f flux/apps/donetick/deployment.yaml
```

- [ ] **Step 3: Commit**

```bash
git add flux/apps/donetick/deployment.yaml
git commit -m "feat(donetick): add security context and readiness probe"
```

---

### Task 4: Satisfactory — security context + readiness probe

**Files:**
- Modify: `flux/apps/satisfactory/deployment.yaml`

Satisfactory has no HTTP endpoint. Use a TCP socket probe on the admin API port (8888), which the server opens once ready. Allow 60s startup time.

- [ ] **Step 1: Add security context and readiness probe**

After `limits` block (after line 44), add:
```yaml
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
          readinessProbe:
            tcpSocket:
              port: 8888
            initialDelaySeconds: 60
            periodSeconds: 15
            failureThreshold: 5
```

- [ ] **Step 2: Validate**

```bash
kubectl apply --dry-run=client -f flux/apps/satisfactory/deployment.yaml
```

- [ ] **Step 3: Commit**

```bash
git add flux/apps/satisfactory/deployment.yaml
git commit -m "feat(satisfactory): add security context and readiness probe"
```

---

### Task 5: Paperless — security contexts and probes for all 5 components

**Files:**
- Modify: `flux/apps/paperless/web.yaml`
- Modify: `flux/apps/paperless/worker.yaml`
- Modify: `flux/apps/paperless/scheduler.yaml`
- Modify: `flux/apps/paperless/postgres.yaml`
- Modify: `flux/apps/paperless/redis.yaml`

#### web.yaml — security context + HTTP readiness probe

- [ ] **Step 1: Add to web.yaml after `limits` block (after line 68)**

```yaml
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
          readinessProbe:
            httpGet:
              path: /
              port: 8000
            initialDelaySeconds: 30
            periodSeconds: 15
            failureThreshold: 3
```

#### worker.yaml — security context + liveness probe

Worker runs Celery, no HTTP port. Use `pgrep -f celery` to verify the process is alive.

- [ ] **Step 2: Add to worker.yaml after `limits` block (after line 58)**

```yaml
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
          livenessProbe:
            exec:
              command: [pgrep, -f, celery]
            initialDelaySeconds: 30
            periodSeconds: 30
            failureThreshold: 3
```

#### scheduler.yaml — security context + liveness probe

- [ ] **Step 3: Add to scheduler.yaml after `limits` block (after line 49)**

```yaml
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
          livenessProbe:
            exec:
              command: [pgrep, -f, celery]
            initialDelaySeconds: 30
            periodSeconds: 30
            failureThreshold: 3
```

#### postgres.yaml — security context + pg_isready readiness probe

- [ ] **Step 4: Add to postgres.yaml after `limits` block (after line 43)**

```yaml
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
          readinessProbe:
            exec:
              command: [pg_isready, -U, paperless, -d, paperless]
            initialDelaySeconds: 10
            periodSeconds: 5
            failureThreshold: 3
```

#### redis.yaml — security context + redis-cli ping readiness probe

- [ ] **Step 5: Add to redis.yaml after `limits` block (after line 34)**

```yaml
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
          readinessProbe:
            exec:
              command: [redis-cli, ping]
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 3
```

- [ ] **Step 6: Validate all five files**

```bash
for f in flux/apps/paperless/web.yaml flux/apps/paperless/worker.yaml \
          flux/apps/paperless/scheduler.yaml flux/apps/paperless/postgres.yaml \
          flux/apps/paperless/redis.yaml; do
  kubectl apply --dry-run=client -f "$f" && echo "OK: $f"
done
```
Expected: `OK: <file>` for each

- [ ] **Step 7: Commit**

```bash
git add flux/apps/paperless/web.yaml flux/apps/paperless/worker.yaml \
        flux/apps/paperless/scheduler.yaml flux/apps/paperless/postgres.yaml \
        flux/apps/paperless/redis.yaml
git commit -m "feat(paperless): add security contexts and health probes to all components"
```

---

## Chunk 2: Network Policies

### Task 6: Network policies — baseline (default-deny + DNS allow)

**Files:**
- Read: `flux/apps/foundry/ks.yaml` (to understand Flux Kustomization CR format)
- Create: `flux/apps/network-policies/ks.yaml`
- Create: `flux/apps/network-policies/kustomization.yaml`
- Create: `flux/apps/network-policies/default-deny.yaml`
- Modify: `flux/apps/kustomization.yaml`

NetworkPolicy semantics: when a pod matches ANY policy with `policyTypes: [Egress]`, its egress is restricted to the union of all matching policies' egress rules. This means:
- `default-deny-all` (empty podSelector, no rules) = deny all ingress + egress for every pod in namespace
- `allow-dns-egress` (empty podSelector, rule for port 53) = allow DNS for all pods
- Per-app policies add further specific allows

- [ ] **Step 1: Read an existing ks.yaml to understand the format**

```bash
cat flux/apps/foundry/ks.yaml
```

- [ ] **Step 2: Create `flux/apps/network-policies/default-deny.yaml`**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: default
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns-egress
  namespace: default
spec:
  podSelector: {}
  policyTypes:
    - Egress
  egress:
    - ports:
        - port: 53
          protocol: UDP
        - port: 53
          protocol: TCP
```

- [ ] **Step 3: Create `flux/apps/network-policies/kustomization.yaml`**

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - default-deny.yaml
```

- [ ] **Step 4: Create `flux/apps/network-policies/ks.yaml`**

Model this exactly after the format from Step 1. It should be a Flux `Kustomization` CR pointing at the `network-policies` path in the repo.

- [ ] **Step 5: Add network-policies to `flux/apps/kustomization.yaml`**

Add `- network-policies/ks.yaml` to the resources list.

- [ ] **Step 6: Validate**

```bash
kubectl apply --dry-run=client -f flux/apps/network-policies/default-deny.yaml
```
Expected: 2 resources created (dry run)

- [ ] **Step 7: Commit**

```bash
git add flux/apps/network-policies/ flux/apps/kustomization.yaml
git commit -m "feat(netpol): add default-deny-all and allow-dns-egress baseline policies"
```

---

### Task 7: Network policies — foundry, homepage, donetick

**Files:**
- Create: `flux/apps/foundry/networkpolicy.yaml`
- Modify: `flux/apps/foundry/kustomization.yaml`
- Create: `flux/apps/homepage/networkpolicy.yaml`
- Modify: `flux/apps/homepage/kustomization.yaml`
- Create: `flux/apps/donetick/networkpolicy.yaml`
- Modify: `flux/apps/donetick/kustomization.yaml`

All Tailscale-ingressed apps: allow ingress from `tailscale` namespace (where the operator's proxy pods live). K8s 1.21+ auto-labels namespaces as `kubernetes.io/metadata.name: <name>`.

**Foundry** also needs HTTPS egress for Foundry license server calls.
**Homepage** also needs egress to the K8s API server (port 443 and 6443 for k3s).

- [ ] **Step 1: Create `flux/apps/foundry/networkpolicy.yaml`**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: foundry
  namespace: default
spec:
  podSelector:
    matchLabels:
      app: foundry
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: tailscale
      ports:
        - port: 30000
          protocol: TCP
  egress:
    - ports:
        - port: 443
          protocol: TCP
        - port: 80
          protocol: TCP
```

- [ ] **Step 2: Add to `flux/apps/foundry/kustomization.yaml`**

Add `- networkpolicy.yaml` to the resources list.

- [ ] **Step 3: Create `flux/apps/homepage/networkpolicy.yaml`**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: homepage
  namespace: default
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: homepage
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: tailscale
      ports:
        - port: 3000
          protocol: TCP
  egress:
    - ports:
        - port: 443
          protocol: TCP
        - port: 6443
          protocol: TCP
```

- [ ] **Step 4: Add to `flux/apps/homepage/kustomization.yaml`**

Add `- networkpolicy.yaml` to the resources list.

- [ ] **Step 5: Create `flux/apps/donetick/networkpolicy.yaml`**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: donetick
  namespace: default
spec:
  podSelector:
    matchLabels:
      app: donetick
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: tailscale
      ports:
        - port: 2021
          protocol: TCP
```

- [ ] **Step 6: Add to `flux/apps/donetick/kustomization.yaml`**

Add `- networkpolicy.yaml` to the resources list.

- [ ] **Step 7: Validate all three**

```bash
for f in flux/apps/foundry/networkpolicy.yaml \
          flux/apps/homepage/networkpolicy.yaml \
          flux/apps/donetick/networkpolicy.yaml; do
  kubectl apply --dry-run=client -f "$f" && echo "OK: $f"
done
```

- [ ] **Step 8: Commit**

```bash
git add flux/apps/foundry/networkpolicy.yaml flux/apps/foundry/kustomization.yaml \
        flux/apps/homepage/networkpolicy.yaml flux/apps/homepage/kustomization.yaml \
        flux/apps/donetick/networkpolicy.yaml flux/apps/donetick/kustomization.yaml
git commit -m "feat(netpol): add per-app network policies for foundry, homepage, donetick"
```

---

### Task 8: Network policies — paperless

**Files:**
- Create: `flux/apps/paperless/networkpolicies.yaml`
- Modify: `flux/apps/paperless/kustomization.yaml`

Paperless has internal service dependencies: web/worker/scheduler all talk to postgres (5432) and redis (6379). Postgres and redis should only accept connections from paperless pods (not from other apps in the namespace).

- [ ] **Step 1: Create `flux/apps/paperless/networkpolicies.yaml`**

```yaml
# paperless-web: ingress from tailscale, egress to postgres + redis
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: paperless-web
  namespace: default
spec:
  podSelector:
    matchLabels:
      app: paperless-web
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: tailscale
      ports:
        - port: 8000
          protocol: TCP
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: paperless-postgres
      ports:
        - port: 5432
          protocol: TCP
    - to:
        - podSelector:
            matchLabels:
              app: paperless-redis
      ports:
        - port: 6379
          protocol: TCP
---
# paperless-worker: no ingress, egress to postgres + redis
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: paperless-worker
  namespace: default
spec:
  podSelector:
    matchLabels:
      app: paperless-worker
  policyTypes:
    - Egress
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: paperless-postgres
      ports:
        - port: 5432
          protocol: TCP
    - to:
        - podSelector:
            matchLabels:
              app: paperless-redis
      ports:
        - port: 6379
          protocol: TCP
---
# paperless-scheduler: no ingress, egress to postgres + redis
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: paperless-scheduler
  namespace: default
spec:
  podSelector:
    matchLabels:
      app: paperless-scheduler
  policyTypes:
    - Egress
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: paperless-postgres
      ports:
        - port: 5432
          protocol: TCP
    - to:
        - podSelector:
            matchLabels:
              app: paperless-redis
      ports:
        - port: 6379
          protocol: TCP
---
# paperless-postgres: only accept from paperless pods
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: paperless-postgres
  namespace: default
spec:
  podSelector:
    matchLabels:
      app: paperless-postgres
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: paperless-web
        - podSelector:
            matchLabels:
              app: paperless-worker
        - podSelector:
            matchLabels:
              app: paperless-scheduler
      ports:
        - port: 5432
          protocol: TCP
---
# paperless-redis: only accept from paperless pods
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: paperless-redis
  namespace: default
spec:
  podSelector:
    matchLabels:
      app: paperless-redis
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: paperless-web
        - podSelector:
            matchLabels:
              app: paperless-worker
        - podSelector:
            matchLabels:
              app: paperless-scheduler
      ports:
        - port: 6379
          protocol: TCP
```

- [ ] **Step 2: Add to `flux/apps/paperless/kustomization.yaml`**

Add `- networkpolicies.yaml` to the resources list.

- [ ] **Step 3: Validate**

```bash
kubectl apply --dry-run=client -f flux/apps/paperless/networkpolicies.yaml
```
Expected: 5 resources created (dry run)

- [ ] **Step 4: Commit**

```bash
git add flux/apps/paperless/networkpolicies.yaml flux/apps/paperless/kustomization.yaml
git commit -m "feat(netpol): add network policies for paperless isolating postgres and redis"
```

---

### Task 9: Network policies — satisfactory

**Files:**
- Create: `flux/apps/satisfactory/networkpolicy.yaml`
- Modify: `flux/apps/satisfactory/kustomization.yaml`

Satisfactory uses a Tailscale LoadBalancer (not Ingress), so proxy traffic still comes from the `tailscale` namespace. The game server also needs internet egress to reach Epic Online Services (EOS) for session management.

- [ ] **Step 1: Create `flux/apps/satisfactory/networkpolicy.yaml`**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: satisfactory
  namespace: default
spec:
  podSelector:
    matchLabels:
      app: satisfactory
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: tailscale
      ports:
        - port: 7777
          protocol: TCP
        - port: 7777
          protocol: UDP
        - port: 8888
          protocol: TCP
  egress:
    - ports:
        - port: 443
          protocol: TCP
        - port: 80
          protocol: TCP
        - port: 7777
          protocol: UDP
```

- [ ] **Step 2: Add to `flux/apps/satisfactory/kustomization.yaml`**

Add `- networkpolicy.yaml` to the resources list.

- [ ] **Step 3: Validate**

```bash
kubectl apply --dry-run=client -f flux/apps/satisfactory/networkpolicy.yaml
```

- [ ] **Step 4: Commit**

```bash
git add flux/apps/satisfactory/networkpolicy.yaml flux/apps/satisfactory/kustomization.yaml
git commit -m "feat(netpol): add network policy for satisfactory"
```

---

## Chunk 3: Pre-commit Validation

### Task 10: Pre-commit validation — YAML lint + SOPS encryption check

**Files:**
- Create: `scripts/check-sops-encrypted.sh`
- Create: `.pre-commit-config.yaml`

Two hooks:
1. **check-yaml** (built-in): validates YAML syntax on all non-encrypted manifests
2. **check-sops-encrypted** (local script): verifies every `flux/apps/*/secret.yaml` contains a `sops:` key (i.e., is encrypted)

- [ ] **Step 1: Create `scripts/check-sops-encrypted.sh`**

```bash
#!/usr/bin/env bash
# Verify all secret.yaml files under flux/apps/ are SOPS-encrypted.
# A SOPS-encrypted file contains a top-level "sops:" key.
set -euo pipefail

failed=0
while IFS= read -r -d '' file; do
  if ! grep -q "^sops:" "$file"; then
    echo "ERROR: $file is NOT SOPS-encrypted (missing 'sops:' key)"
    failed=1
  fi
done < <(find flux/apps -name "secret.yaml" -print0 2>/dev/null)

if [[ $failed -eq 0 ]]; then
  echo "All secret.yaml files are SOPS-encrypted."
fi
exit $failed
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/check-sops-encrypted.sh
```

- [ ] **Step 3: Manually test the script**

```bash
./scripts/check-sops-encrypted.sh
```
Expected: `All secret.yaml files are SOPS-encrypted.`

If any file prints `ERROR:`, stop and investigate before continuing.

- [ ] **Step 4: Create `.pre-commit-config.yaml`**

```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v5.0.0
    hooks:
      - id: check-yaml
        args: [--allow-multiple-documents]
        # Skip SOPS-encrypted files — they contain non-standard YAML after encryption
        exclude: 'flux/apps/.*/secret\.yaml'
      - id: trailing-whitespace
      - id: end-of-file-fixer

  - repo: local
    hooks:
      - id: check-sops-encrypted
        name: Verify secrets are SOPS-encrypted
        language: script
        entry: scripts/check-sops-encrypted.sh
        pass_filenames: false
        always_run: true
```

- [ ] **Step 5: Install pre-commit and run against all files**

```bash
# Install pre-commit if not already installed
pip install pre-commit   # or: brew install pre-commit

# Install the hooks
pre-commit install

# Run against all files to verify no existing issues
pre-commit run --all-files
```
Expected: All hooks pass. If `check-yaml` fails on any manifest, fix the YAML syntax.

- [ ] **Step 6: Commit**

```bash
git add .pre-commit-config.yaml scripts/check-sops-encrypted.sh
git commit -m "feat(ci): add pre-commit hooks for YAML lint and SOPS encryption verification"
```

---

## Post-Implementation Verification

After all tasks are committed and pushed, verify Flux applies everything cleanly:

```bash
# Push to main to trigger Flux reconciliation
git push

# Force immediate reconciliation
flux reconcile kustomization flux-system --with-source

# Check all apps are healthy
flux get kustomizations
flux get helmreleases -A

# Verify network policies were created
kubectl get networkpolicy -n default

# Verify no pods are stuck (readiness probe failures will show here)
kubectl get pods -n default -w

# Check a specific app's probe status if a pod is not ready
kubectl describe pod -n default -l app=foundry
```

### Likely Issues to Watch For

1. **Foundry readiness probe fails**: The `felddy/foundryvtt` image may not serve HTTP on `/` until fully initialized. If probe fails, increase `initialDelaySeconds` to 120 or check what path it exposes (try `/game` or `/setup`).

2. **Satisfactory TCP probe fails**: Port 8888 may not open immediately. Increase `initialDelaySeconds` if needed.

3. **Homepage can't reach K8s API**: If homepage loses cluster discovery, the network policy egress ports (443/6443) may need adjustment. Check with `kubectl logs -n default -l app.kubernetes.io/name=homepage`.

4. **Network policy blocks Tailscale proxy**: If apps become unreachable, verify the tailscale namespace has the auto-label `kubernetes.io/metadata.name: tailscale`. Check with:
   ```bash
   kubectl get namespace tailscale --show-labels
   ```
   This label is automatic in K8s 1.21+. K3s uses the same upstream K8s, so it should be present.

5. **Paperless worker/scheduler liveness probe false-positives**: `pgrep -f celery` will match the probe command itself if it runs in the same process namespace. If pods restart unexpectedly, replace with:
   ```yaml
   exec:
     command: [/bin/sh, -c, "pgrep -f 'celery.*worker' || pgrep -f 'celery.*beat'"]
   ```
