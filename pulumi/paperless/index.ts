// To import existing resources into this stack, run:
//   pulumi import 'kubernetes:core/v1:Secret' paperless-secret 'default/paperless-secret'
//   pulumi import 'kubernetes:core/v1:PersistentVolumeClaim' paperless-data-claim 'default/paperless-data-claim'
//   pulumi import 'kubernetes:core/v1:PersistentVolumeClaim' paperless-media-claim 'default/paperless-media-claim'
//   pulumi import 'kubernetes:core/v1:PersistentVolumeClaim' paperless-consume-claim 'default/paperless-consume-claim'
//   pulumi import 'kubernetes:core/v1:PersistentVolumeClaim' paperless-postgres-claim 'default/paperless-postgres-claim'
//   pulumi import 'kubernetes:core/v1:PersistentVolumeClaim' paperless-redis-claim 'default/paperless-redis-claim'
//   pulumi import 'kubernetes:apps/v1:Deployment' paperless-postgres 'default/paperless-postgres'
//   pulumi import 'kubernetes:core/v1:Service' paperless-postgres 'default/paperless-postgres'
//   pulumi import 'kubernetes:apps/v1:Deployment' paperless-redis 'default/paperless-redis'
//   pulumi import 'kubernetes:core/v1:Service' paperless-redis 'default/paperless-redis'
//   pulumi import 'kubernetes:apps/v1:Deployment' paperless-web 'default/paperless-web'
//   pulumi import 'kubernetes:apps/v1:Deployment' paperless-worker 'default/paperless-worker'
//   pulumi import 'kubernetes:apps/v1:Deployment' paperless-scheduler 'default/paperless-scheduler'
//   pulumi import 'kubernetes:core/v1:Service' paperless 'default/paperless'
//   pulumi import 'kubernetes:networking.k8s.io/v1:Ingress' paperless 'default/paperless'

import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";
import { makeLonghornPVC, makeTailscaleIngress, SERVICE_IGNORE_CHANGES } from "../lib/k8s";

const config = new pulumi.Config();
const dbPassword = config.requireSecret("dbPassword");
const secretKey = config.requireSecret("secretKey");
const adminUser = config.requireSecret("adminUser");
const adminPassword = config.requireSecret("adminPassword");
const adminEmail = config.requireSecret("adminEmail");

const DB_NAME = "paperless";
const DB_USER = "paperless";

/**
 * Provisions the PostgreSQL backing store for Paperless-ngx.
 *
 * Uses Recreate strategy — two postgres pods against the same PVC would corrupt
 * the database.
 */
class PaperlessDatabase extends pulumi.ComponentResource {
    /** The postgres Service name — used by the web/worker/scheduler containers. */
    public readonly serviceName: pulumi.Output<string>;

    constructor(
        name: string,
        secret: kubernetes.core.v1.Secret,
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super("homelab:paperless:PaperlessDatabase", name, {}, opts);

        const pvc = makeLonghornPVC(
            "paperless-postgres-claim",
            "paperless-postgres-claim",
            "10Gi",
            "default",
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        new kubernetes.apps.v1.Deployment(
            "paperless-postgres",
            {
                metadata: { name: "paperless-postgres", namespace: "default", annotations: { "pulumi.com/patchForce": "true" } },
                spec: {
                    // Recreate: stop old pod before starting new one to avoid two
                    // processes writing to the same PVC simultaneously.
                    strategy: { type: "Recreate" },
                    selector: { matchLabels: { app: "paperless-postgres" } },
                    template: {
                        metadata: { labels: { app: "paperless-postgres" } },
                        spec: {
                            containers: [
                                {
                                    name: "postgres",
                                    image: "postgres:16.12",
                                    resources: {
                                        requests: { cpu: "50m", memory: "128Mi" },
                                        limits: { cpu: "500m", memory: "512Mi" },
                                    },
                                    env: [
                                        { name: "POSTGRES_DB", value: DB_NAME },
                                        { name: "POSTGRES_USER", value: DB_USER },
                                        {
                                            name: "POSTGRES_PASSWORD",
                                            valueFrom: {
                                                secretKeyRef: {
                                                    name: secret.metadata.name,
                                                    key: "PAPERLESS_DBPASS",
                                                },
                                            },
                                        },
                                    ],
                                    readinessProbe: {
                                        exec: {
                                            command: [
                                                "pg_isready",
                                                "-U",
                                                DB_USER,
                                                "-d",
                                                DB_NAME,
                                            ],
                                        },
                                        initialDelaySeconds: 5,
                                        periodSeconds: 10,
                                    },
                                    volumeMounts: [
                                        {
                                            name: "postgres-data",
                                            mountPath: "/var/lib/postgresql/data",
                                            // subPath prevents postgres from complaining that the
                                            // mount directory is not empty (Longhorn writes metadata
                                            // at the volume root).
                                            subPath: "pgdata",
                                        },
                                    ],
                                },
                            ],
                            volumes: [
                                {
                                    name: "postgres-data",
                                    persistentVolumeClaim: { claimName: pvc.metadata.name },
                                },
                            ],
                        },
                    },
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        const service = new kubernetes.core.v1.Service(
            "paperless-postgres",
            {
                metadata: { name: "paperless-postgres", namespace: "default" },
                spec: {
                    type: "ClusterIP" as const,
                    selector: { app: "paperless-postgres" },
                    ports: [{ port: 5432, targetPort: 5432 }],
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }], ignoreChanges: SERVICE_IGNORE_CHANGES },
        );

        this.serviceName = service.metadata.name;
        this.registerOutputs({ serviceName: this.serviceName });
    }
}

/**
 * Provisions the Redis instance used by Paperless-ngx as a task broker between
 * the web frontend and the Celery worker/scheduler.
 */
class PaperlessCache extends pulumi.ComponentResource {
    /** The redis Service name — used by the web/worker/scheduler containers. */
    public readonly serviceName: pulumi.Output<string>;

    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("homelab:paperless:PaperlessCache", name, {}, opts);

        const pvc = makeLonghornPVC(
            "paperless-redis-claim",
            "paperless-redis-claim",
            "1Gi",
            "default",
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        new kubernetes.apps.v1.Deployment(
            "paperless-redis",
            {
                metadata: { name: "paperless-redis", namespace: "default", annotations: { "pulumi.com/patchForce": "true" } },
                spec: {
                    strategy: { type: "Recreate" },
                    selector: { matchLabels: { app: "paperless-redis" } },
                    template: {
                        metadata: { labels: { app: "paperless-redis" } },
                        spec: {
                            containers: [
                                {
                                    name: "redis",
                                    image: "redis:7.4.7",
                                    resources: {
                                        requests: { cpu: "50m", memory: "64Mi" },
                                        limits: { cpu: "200m", memory: "256Mi" },
                                    },
                                    readinessProbe: {
                                        exec: { command: ["redis-cli", "ping"] },
                                        initialDelaySeconds: 5,
                                        periodSeconds: 10,
                                    },
                                    volumeMounts: [
                                        {
                                            name: "redis-data",
                                            mountPath: "/data",
                                        },
                                    ],
                                },
                            ],
                            volumes: [
                                {
                                    name: "redis-data",
                                    persistentVolumeClaim: { claimName: pvc.metadata.name },
                                },
                            ],
                        },
                    },
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        const service = new kubernetes.core.v1.Service(
            "paperless-redis",
            {
                metadata: { name: "paperless-redis", namespace: "default" },
                spec: {
                    type: "ClusterIP" as const,
                    selector: { app: "paperless-redis" },
                    ports: [{ port: 6379, targetPort: 6379 }],
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }], ignoreChanges: SERVICE_IGNORE_CHANGES },
        );

        this.serviceName = service.metadata.name;
        this.registerOutputs({ serviceName: this.serviceName });
    }
}

/**
 * Arguments for {@link PaperlessApp}.
 *
 * Grouped into a single object so the constructor signature stays stable as
 * the number of cross-component dependencies grows.
 */
interface PaperlessAppArgs {
    /** Shared K8s Secret containing all app credentials. */
    secret: kubernetes.core.v1.Secret;
    /** Postgres Service name, passed as `PAPERLESS_DBHOST`. */
    dbService: pulumi.Output<string>;
    /** Redis Service name, used to build `PAPERLESS_REDIS_URL`. */
    redisService: pulumi.Output<string>;
}

/**
 * Provisions the Paperless-ngx application tier: web server, Celery worker, and
 * Celery beat scheduler. Split into separate Deployments so K8s can restart each
 * process independently.
 */
class PaperlessApp extends pulumi.ComponentResource {
    constructor(
        name: string,
        args: PaperlessAppArgs,
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super("homelab:paperless:PaperlessApp", name, {}, opts);
        const { secret, dbService, redisService } = args;

        const dataPvc = makeLonghornPVC(
            "paperless-data-claim",
            "paperless-data-claim",
            "10Gi",
            "default",
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        const mediaPvc = makeLonghornPVC(
            "paperless-media-claim",
            "paperless-media-claim",
            "50Gi",
            "default",
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        const consumePvc = makeLonghornPVC(
            "paperless-consume-claim",
            "paperless-consume-claim",
            "10Gi",
            "default",
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        const appVolumes = [
            { name: "data", persistentVolumeClaim: { claimName: dataPvc.metadata.name } },
            { name: "media", persistentVolumeClaim: { claimName: mediaPvc.metadata.name } },
            { name: "consume", persistentVolumeClaim: { claimName: consumePvc.metadata.name } },
        ];

        const appVolumeMounts = [
            { name: "data", mountPath: "/usr/src/paperless/data" },
            { name: "media", mountPath: "/usr/src/paperless/media" },
            { name: "consume", mountPath: "/usr/src/paperless/consume" },
        ];

        const appEnv = [
            {
                name: "PAPERLESS_DBHOST",
                value: dbService,
            },
            {
                name: "PAPERLESS_REDIS_URL",
                value: pulumi.interpolate`redis://${redisService}:6379`,
            },
            {
                name: "PAPERLESS_DBPASS",
                valueFrom: { secretKeyRef: { name: secret.metadata.name, key: "PAPERLESS_DBPASS" } },
            },
            {
                name: "PAPERLESS_SECRET_KEY",
                valueFrom: {
                    secretKeyRef: { name: secret.metadata.name, key: "PAPERLESS_SECRET_KEY" },
                },
            },
            {
                name: "PAPERLESS_ADMIN_USER",
                valueFrom: {
                    secretKeyRef: { name: secret.metadata.name, key: "PAPERLESS_ADMIN_USER" },
                },
            },
            {
                name: "PAPERLESS_ADMIN_PASSWORD",
                valueFrom: {
                    secretKeyRef: {
                        name: secret.metadata.name,
                        key: "PAPERLESS_ADMIN_PASSWORD",
                    },
                },
            },
            {
                name: "PAPERLESS_ADMIN_MAIL",
                valueFrom: {
                    secretKeyRef: {
                        name: secret.metadata.name,
                        key: "PAPERLESS_ADMIN_MAIL",
                    },
                },
            },
            { name: "PAPERLESS_DBUSER", value: DB_USER },
            { name: "PAPERLESS_DBNAME", value: DB_NAME },
            { name: "PAPERLESS_OCR_LANGUAGE", value: "eng" },
            { name: "PAPERLESS_TIME_ZONE", value: "America/New_York" },
            // Limit OCR concurrency to 1 worker / 1 thread to prevent OOM kills
            // during document ingestion on this single-node cluster.
            { name: "PAPERLESS_TASK_WORKERS", value: "1" },
            { name: "PAPERLESS_THREADS_PER_WORKER", value: "1" },
        ];

        new kubernetes.apps.v1.Deployment(
            "paperless-web",
            {
                metadata: { name: "paperless-web", namespace: "default", annotations: { "pulumi.com/patchForce": "true" } },
                spec: {
                    strategy: { type: "Recreate" },
                    selector: { matchLabels: { app: "paperless-web" } },
                    template: {
                        metadata: { labels: { app: "paperless-web" } },
                        spec: {
                            containers: [
                                {
                                    name: "paperless",
                                    image: "ghcr.io/paperless-ngx/paperless-ngx:latest",
                                    env: appEnv,
                                    resources: {
                                        requests: { cpu: "100m", memory: "512Mi" },
                                        // 3Gi headroom: gunicorn + inline celery + OCR can spike
                                        // hard even with THREADS_PER_WORKER=1.
                                        limits: { cpu: "1", memory: "3Gi" },
                                    },
                                    // The Host header override is required because Paperless
                                    // validates the Host header against PAPERLESS_URL — without it,
                                    // the readiness check would fail with a 400 Bad Request.
                                    readinessProbe: {
                                        httpGet: {
                                            path: "/",
                                            port: 8000,
                                            httpHeaders: [
                                                { name: "Host", value: "localhost" },
                                            ],
                                        },
                                        initialDelaySeconds: 30,
                                        periodSeconds: 10,
                                    },
                                    volumeMounts: appVolumeMounts,
                                },
                            ],
                            volumes: appVolumes,
                        },
                    },
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        new kubernetes.apps.v1.Deployment(
            "paperless-worker",
            {
                metadata: { name: "paperless-worker", namespace: "default" },
                spec: {
                    strategy: { type: "Recreate" },
                    selector: { matchLabels: { app: "paperless-worker" } },
                    template: {
                        metadata: { labels: { app: "paperless-worker" } },
                        spec: {
                            containers: [
                                {
                                    name: "worker",
                                    image: "ghcr.io/paperless-ngx/paperless-ngx:latest",
                                    command: [
                                        "celery",
                                        "--app",
                                        "paperless",
                                        "worker",
                                        "--loglevel",
                                        "INFO",
                                    ],
                                    env: appEnv,
                                    resources: {
                                        requests: { cpu: "100m", memory: "512Mi" },
                                        limits: { cpu: "1", memory: "2Gi" },
                                    },
                                    volumeMounts: appVolumeMounts,
                                },
                            ],
                            volumes: appVolumes,
                        },
                    },
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        new kubernetes.apps.v1.Deployment(
            "paperless-scheduler",
            {
                metadata: { name: "paperless-scheduler", namespace: "default" },
                spec: {
                    strategy: { type: "Recreate" },
                    selector: { matchLabels: { app: "paperless-scheduler" } },
                    template: {
                        metadata: { labels: { app: "paperless-scheduler" } },
                        spec: {
                            containers: [
                                {
                                    name: "scheduler",
                                    image: "ghcr.io/paperless-ngx/paperless-ngx:latest",
                                    command: [
                                        "celery",
                                        "--app",
                                        "paperless",
                                        "beat",
                                        "--loglevel",
                                        "INFO",
                                    ],
                                    env: appEnv,
                                    resources: {
                                        requests: { cpu: "50m", memory: "128Mi" },
                                        limits: { cpu: "200m", memory: "256Mi" },
                                    },
                                    volumeMounts: appVolumeMounts,
                                },
                            ],
                            volumes: appVolumes,
                        },
                    },
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        const service = new kubernetes.core.v1.Service(
            "paperless",
            {
                metadata: { name: "paperless", namespace: "default" },
                spec: {
                    type: "ClusterIP" as const,
                    selector: { app: "paperless-web" },
                    ports: [{ port: 8000, targetPort: 8000 }],
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }], ignoreChanges: SERVICE_IGNORE_CHANGES },
        );

        makeTailscaleIngress(
            "paperless",
            "paperless",
            service.metadata.name,
            8000,
            "default",
            { parent: this, dependsOn: [service], aliases: [{ parent: pulumi.rootStackResource }] },
        );

        this.registerOutputs({});
    }
}

/**
 * Top-level component that wires the database, cache, and application tiers
 * into a complete Paperless-ngx deployment via a single shared Secret.
 */
class PaperlessStack extends pulumi.ComponentResource {
    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("homelab:paperless:PaperlessStack", name, {}, opts);

        const secret = new kubernetes.core.v1.Secret(
            "paperless-secret",
            {
                metadata: { name: "paperless-secret", namespace: "default" },
                type: "Opaque",
                stringData: {
                    PAPERLESS_DBPASS: dbPassword,
                    PAPERLESS_SECRET_KEY: secretKey,
                    PAPERLESS_ADMIN_USER: adminUser,
                    PAPERLESS_ADMIN_PASSWORD: adminPassword,
                    PAPERLESS_ADMIN_MAIL: adminEmail,
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        const db = new PaperlessDatabase("paperless-db", secret, { parent: this });
        const cache = new PaperlessCache("paperless-cache", { parent: this });

        new PaperlessApp(
            "paperless-app",
            { secret, dbService: db.serviceName, redisService: cache.serviceName },
            { parent: this },
        );

        this.registerOutputs({});
    }
}

new PaperlessStack("paperless");
