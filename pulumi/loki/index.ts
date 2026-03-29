// To import existing resources into this stack, run:
//   pulumi import 'kubernetes:helm.sh/v3:Release' loki 'default/loki'

import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";

/**
 * Deploys Loki in SingleBinary mode for log aggregation. Alloy ships logs here;
 * Grafana queries here.
 */
class LokiStack extends pulumi.ComponentResource {
    /** The Loki Helm release. */
    public readonly release: kubernetes.helm.v3.Release;

    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("homelab:monitoring:LokiStack", name, {}, opts);

        this.release = new kubernetes.helm.v3.Release(
            "loki",
            {
                name: "loki",
                namespace: "default",
                chart: "loki",
                version: "9.3.3",
                repositoryOpts: {
                    repo: "https://grafana-community.github.io/helm-charts",
                },
                values: {
                    deploymentMode: "SingleBinary",
                    singleBinary: {
                        replicas: 1,
                        resources: {
                            requests: { cpu: "50m", memory: "128Mi" },
                            limits: { memory: "384Mi" },
                        },
                        persistence: {
                            enabled: true,
                            storageClass: "longhorn",
                            size: "20Gi",
                        },
                    },
                    loki: {
                        storage: {
                            type: "filesystem",
                        },
                        commonConfig: {
                            // replication_factor: 1 — setting >1 would cause Loki to refuse
                            // writes until it found a second ingester that doesn't exist.
                            replication_factor: 1,
                        },
                        schemaConfig: {
                            configs: [
                                {
                                    from: "2024-01-01",
                                    store: "tsdb",
                                    object_store: "filesystem",
                                    schema: "v13",
                                    index: { prefix: "index_", period: "24h" },
                                },
                            ],
                        },
                        limits_config: {
                            retention_period: "168h",
                        },
                        compactor: {
                            retention_enabled: true,
                            delete_request_store: "filesystem",
                        },
                        auth_enabled: false,
                    },
                    gateway: { enabled: false },
                    chunksCache: { enabled: false },
                    resultsCache: { enabled: false },
                    backend: { replicas: 0 },
                    read: { replicas: 0 },
                    write: { replicas: 0 },
                    minio: { enabled: false },
                    sidecar: { rules: { enabled: false } },
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        this.registerOutputs({ releaseName: this.release.name });
    }
}

const stack = new LokiStack("loki");

export const lokiServiceUrl = "http://loki.default.svc.cluster.local:3100";

export const releaseName = stack.release.name;
