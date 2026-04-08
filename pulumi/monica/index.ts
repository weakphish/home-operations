// To import existing resources into this stack, run:
//   pulumi import 'kubernetes:core/v1:Secret' monica-secret 'default/monica-secret'
//   pulumi import 'kubernetes:core/v1:PersistentVolumeClaim' monica-db 'default/monica-db-claim'
//   pulumi import 'kubernetes:apps/v1:Deployment' monica-db 'default/monica-db'
//   pulumi import 'kubernetes:core/v1:Service' monica-db 'default/monica-db'
//   pulumi import 'kubernetes:core/v1:PersistentVolumeClaim' monica-data 'default/monica-data-claim'
//   pulumi import 'kubernetes:apps/v1:Deployment' monica 'default/monica'
//   pulumi import 'kubernetes:core/v1:Service' monica 'default/monica'
//   pulumi import 'kubernetes:networking.k8s.io/v1:Ingress' monica 'default/monica'
//   pulumi import 'kubernetes:networking.k8s.io/v1:NetworkPolicy' allow-tailscale-to-monica 'default/allow-tailscale-to-monica'
//   pulumi import 'kubernetes:networking.k8s.io/v1:NetworkPolicy' allow-monica-to-mariadb 'default/allow-monica-to-mariadb'
//   pulumi import 'kubernetes:networking.k8s.io/v1:NetworkPolicy' allow-mariadb-from-monica 'default/allow-mariadb-from-monica'

import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";
import { makeLonghornPVC, makeTailscaleIngress, SERVICE_IGNORE_CHANGES } from "../lib/k8s";

const config = new pulumi.Config();
const dbPassword = config.requireSecret("dbPassword");
const appKey = config.requireSecret("appKey");

/**
 * Provisions all Kubernetes resources for Monica CRM, a self-hosted personal
 * relationship manager. Two tiers: MariaDB for relational storage and the
 * Monica web application (Apache variant) for file attachments and the UI.
 */
class MonicaStack extends pulumi.ComponentResource {
    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("homelab:apps:MonicaStack", name, {}, opts);

        // All three secrets share a single K8s Secret so the Monica Deployment
        // and the MariaDB Deployment can both reference it.
        const secret = new kubernetes.core.v1.Secret(
            "monica-secret",
            {
                metadata: { name: "monica-secret", namespace: "default" },
                type: "Opaque",
                stringData: { dbPassword, appKey },
            },
            { parent: this },
        );

        // ── MariaDB ──────────────────────────────────────────────────────────

        const dbPvc = makeLonghornPVC(
            "monica-db",
            "monica-db-claim",
            "5Gi",
            "default",
            { parent: this },
        );

        const dbDeployment = new kubernetes.apps.v1.Deployment(
            "monica-db",
            {
                metadata: {
                    name: "monica-db",
                    namespace: "default",
                    labels: { app: "monica-db" },
                },
                spec: {
                    replicas: 1,
                    selector: { matchLabels: { app: "monica-db" } },
                    // Recreate: MariaDB uses file-level locking; two pods cannot
                    // safely share the same data directory.
                    strategy: { type: "Recreate" },
                    template: {
                        metadata: { labels: { app: "monica-db" } },
                        spec: {
                            volumes: [
                                {
                                    name: "monica-db-data",
                                    persistentVolumeClaim: { claimName: dbPvc.metadata.name },
                                },
                            ],
                            containers: [
                                {
                                    name: "mariadb",
                                    image: "mariadb:10.11",
                                    // Monica requires utf8mb4 for emoji support in contact notes.
                                    args: [
                                        "--character-set-server=utf8mb4",
                                        "--collation-server=utf8mb4_unicode_ci",
                                    ],
                                    ports: [{ name: "mysql", containerPort: 3306, protocol: "TCP" }],
                                    env: [
                                        { name: "MARIADB_DATABASE", value: "monica" },
                                        { name: "MARIADB_USER", value: "monica" },
                                        {
                                            name: "MARIADB_PASSWORD",
                                            valueFrom: {
                                                secretKeyRef: {
                                                    name: secret.metadata.name,
                                                    key: "dbPassword",
                                                },
                                            },
                                        },
                                        {
                                            name: "MARIADB_ROOT_PASSWORD",
                                            valueFrom: {
                                                secretKeyRef: {
                                                    name: secret.metadata.name,
                                                    key: "dbPassword",
                                                },
                                            },
                                        },
                                    ],
                                    volumeMounts: [
                                        { name: "monica-db-data", mountPath: "/var/lib/mysql" },
                                    ],
                                    startupProbe: {
                                        tcpSocket: { port: "mysql" },
                                        failureThreshold: 30,
                                        periodSeconds: 5,
                                    },
                                    livenessProbe: {
                                        tcpSocket: { port: "mysql" },
                                        initialDelaySeconds: 30,
                                        periodSeconds: 30,
                                    },
                                    readinessProbe: {
                                        tcpSocket: { port: "mysql" },
                                        initialDelaySeconds: 10,
                                        periodSeconds: 10,
                                        failureThreshold: 3,
                                    },
                                    resources: {
                                        requests: { cpu: "50m", memory: "256Mi" },
                                        limits: { cpu: "500m", memory: "512Mi" },
                                    },
                                },
                            ],
                        },
                    },
                },
            },
            { parent: this, dependsOn: [dbPvc, secret] },
        );

        const dbService = new kubernetes.core.v1.Service(
            "monica-db",
            {
                metadata: { name: "monica-db", namespace: "default" },
                spec: {
                    type: "ClusterIP" as const,
                    selector: { app: "monica-db" },
                    ports: [{ name: "mysql", port: 3306, targetPort: "mysql" }],
                },
            },
            { parent: this, dependsOn: [dbDeployment], ignoreChanges: SERVICE_IGNORE_CHANGES },
        );

        // ── Monica App ───────────────────────────────────────────────────────

        const appPvc = makeLonghornPVC(
            "monica-data",
            "monica-data-claim",
            "10Gi",
            "default",
            { parent: this },
        );

        const appDeployment = new kubernetes.apps.v1.Deployment(
            "monica",
            {
                metadata: {
                    name: "monica",
                    namespace: "default",
                    labels: { app: "monica" },
                },
                spec: {
                    replicas: 1,
                    selector: { matchLabels: { app: "monica" } },
                    strategy: { type: "Recreate" },
                    template: {
                        metadata: { labels: { app: "monica" } },
                        spec: {
                            volumes: [
                                {
                                    name: "monica-data",
                                    persistentVolumeClaim: { claimName: appPvc.metadata.name },
                                },
                            ],
                            containers: [
                                {
                                    name: "monica",
                                    image: "ghcr.io/monicahq/monica-next:main",
                                    ports: [{ name: "http", containerPort: 80, protocol: "TCP" }],
                                    env: [
                                        { name: "APP_ENV", value: "production" },
                                        { name: "APP_DEBUG", value: "false" },
                                        { name: "APP_URL", value: "https://monica.pipefish-manta.ts.net" },
                                        { name: "DB_CONNECTION", value: "mysql" },
                                        { name: "DB_HOST", value: dbService.metadata.name },
                                        { name: "DB_PORT", value: "3306" },
                                        { name: "DB_DATABASE", value: "monica" },
                                        { name: "DB_USERNAME", value: "monica" },
                                        {
                                            name: "DB_PASSWORD",
                                            valueFrom: {
                                                secretKeyRef: {
                                                    name: secret.metadata.name,
                                                    key: "dbPassword",
                                                },
                                            },
                                        },
                                        {
                                            name: "APP_KEY",
                                            valueFrom: {
                                                secretKeyRef: {
                                                    name: secret.metadata.name,
                                                    key: "appKey",
                                                },
                                            },
                                        },
                                        // Open signup is safe: all traffic goes through Tailscale private network.
                                        // v5 inverts the signup flag from ALLOW_SIGNUP to APP_DISABLE_SIGNUP.
                                        { name: "APP_DISABLE_SIGNUP", value: "false" },
                                        // Stub mail to Laravel's log driver — no SMTP required.
                                        // Replace with real MAIL_* vars when ready.
                                        { name: "MAIL_MAILER", value: "log" },
                                        // Monica runs behind Tailscale Ingress (a reverse proxy);
                                        // trust all proxies so APP_URL https:// links generate correctly.
                                        { name: "APP_TRUSTED_PROXIES", value: "*" },
                                    ],
                                    volumeMounts: [
                                        {
                                            name: "monica-data",
                                            mountPath: "/var/www/html/storage",
                                        },
                                    ],
                                    startupProbe: {
                                        httpGet: { path: "/", port: "http" },
                                        failureThreshold: 30,
                                        periodSeconds: 5,
                                    },
                                    livenessProbe: {
                                        httpGet: { path: "/", port: "http" },
                                        initialDelaySeconds: 30,
                                        periodSeconds: 30,
                                    },
                                    readinessProbe: {
                                        httpGet: { path: "/", port: "http" },
                                        initialDelaySeconds: 10,
                                        periodSeconds: 10,
                                        failureThreshold: 3,
                                    },
                                    resources: {
                                        requests: { cpu: "50m", memory: "256Mi" },
                                        limits: { cpu: "1000m", memory: "512Mi" },
                                    },
                                },
                            ],
                        },
                    },
                },
            },
            { parent: this, dependsOn: [appPvc, secret, dbService] },
        );

        const appService = new kubernetes.core.v1.Service(
            "monica",
            {
                metadata: { name: "monica", namespace: "default" },
                spec: {
                    type: "ClusterIP" as const,
                    selector: { app: "monica" },
                    ports: [{ name: "http", port: 80, targetPort: "http" }],
                },
            },
            { parent: this, dependsOn: [appDeployment], ignoreChanges: SERVICE_IGNORE_CHANGES },
        );

        makeTailscaleIngress(
            "monica",
            "monica",
            appService.metadata.name,
            80,
            "default",
            { parent: this, dependsOn: [appService] },
        );

        // ── Network Policies ─────────────────────────────────────────────────
        // The default namespace has a default-deny-all baseline (see network-policies
        // stack). Each app must explicitly carve out the traffic it needs.

        // Tailscale proxy (in tailscale namespace) → Monica web on port 80.
        new kubernetes.networking.v1.NetworkPolicy(
            "allow-tailscale-to-monica",
            {
                metadata: { name: "allow-tailscale-to-monica", namespace: "default" },
                spec: {
                    podSelector: { matchLabels: { app: "monica" } },
                    policyTypes: ["Ingress"],
                    ingress: [
                        {
                            from: [
                                {
                                    namespaceSelector: {
                                        matchLabels: {
                                            "kubernetes.io/metadata.name": "tailscale",
                                        },
                                    },
                                },
                            ],
                            ports: [{ port: "http", protocol: "TCP" }],
                        },
                    ],
                },
            },
            { parent: this },
        );

        // Monica app → MariaDB on port 3306 (egress side).
        new kubernetes.networking.v1.NetworkPolicy(
            "allow-monica-to-mariadb",
            {
                metadata: { name: "allow-monica-to-mariadb", namespace: "default" },
                spec: {
                    podSelector: { matchLabels: { app: "monica" } },
                    policyTypes: ["Egress"],
                    egress: [
                        {
                            to: [{ podSelector: { matchLabels: { app: "monica-db" } } }],
                            ports: [{ port: 3306, protocol: "TCP" }],
                        },
                    ],
                },
            },
            { parent: this },
        );

        // MariaDB ← Monica app on port 3306 (ingress side).
        new kubernetes.networking.v1.NetworkPolicy(
            "allow-mariadb-from-monica",
            {
                metadata: { name: "allow-mariadb-from-monica", namespace: "default" },
                spec: {
                    podSelector: { matchLabels: { app: "monica-db" } },
                    policyTypes: ["Ingress"],
                    ingress: [
                        {
                            from: [{ podSelector: { matchLabels: { app: "monica" } } }],
                            ports: [{ port: 3306, protocol: "TCP" }],
                        },
                    ],
                },
            },
            { parent: this },
        );

        this.registerOutputs({});
    }
}

new MonicaStack("monica");
