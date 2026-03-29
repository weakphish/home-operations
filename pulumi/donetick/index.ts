// To import existing resources into this stack, run:
//   pulumi import 'kubernetes:core/v1:PersistentVolumeClaim' donetick-data 'default/donetick-data-claim'
//   pulumi import 'kubernetes:core/v1:Secret' donetick-secret 'default/donetick-secret'
//   pulumi import 'kubernetes:apps/v1:Deployment' donetick 'default/donetick'
//   pulumi import 'kubernetes:core/v1:Service' donetick 'default/donetick'
//   pulumi import 'kubernetes:networking.k8s.io/v1:Ingress' donetick 'default/donetick'

import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";
import { makeLonghornPVC, makeTailscaleIngress, SERVICE_IGNORE_CHANGES } from "../lib/k8s";

const config = new pulumi.Config();
// If this value changes, all active sessions are invalidated.
const jwtSecret = config.requireSecret("jwtSecret");

/**
 * Provisions all Kubernetes resources for Donetick, a self-hosted chore tracker
 * backed by SQLite on a Longhorn PVC.
 */
class DonetickStack extends pulumi.ComponentResource {
    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("homelab:apps:DonetickStack", name, {}, opts);

        const pvc = makeLonghornPVC(
            "donetick-data",
            "donetick-data-claim",
            "10Gi",
            "default",
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        const secret = new kubernetes.core.v1.Secret(
            "donetick-secret",
            {
                metadata: { name: "donetick-secret", namespace: "default" },
                type: "Opaque",
                stringData: { jwtSecret: jwtSecret },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        new kubernetes.apps.v1.Deployment(
            "donetick",
            {
                metadata: {
                    name: "donetick",
                    namespace: "default",
                    labels: { app: "donetick" },
                },
                spec: {
                    replicas: 1,
                    selector: { matchLabels: { app: "donetick" } },
                    // Recreate strategy: SQLite does not support concurrent writers.
                    // If two pods ran simultaneously, the new pod would fail to acquire
                    // the SQLite file lock held by the old pod. Recreate ensures the
                    // old pod is fully terminated before the new one starts.
                    strategy: { type: "Recreate" },
                    template: {
                        metadata: { labels: { app: "donetick" } },
                        spec: {
                            volumes: [
                                {
                                    name: "donetick-data",
                                    persistentVolumeClaim: { claimName: pvc.metadata.name },
                                },
                            ],
                            containers: [
                                {
                                    name: "donetick",
                                    image: "donetick/donetick:latest",
                                    ports: [{ containerPort: 2021 }],
                                    env: [
                                        { name: "DT_ENV", value: "selfhosted" },
                                        { name: "DT_SQLITE_PATH", value: "/donetick-data/donetick.db" },
                                        {
                                            name: "DT_JWT_SECRET",
                                            valueFrom: {
                                                secretKeyRef: {
                                                    name: secret.metadata.name,
                                                    key: "jwtSecret",
                                                },
                                            },
                                        },
                                    ],
                                    volumeMounts: [
                                        { name: "donetick-data", mountPath: "/donetick-data" },
                                    ],
                                    startupProbe: {
                                        httpGet: { path: "/", port: 2021 },
                                        failureThreshold: 30,
                                        periodSeconds: 5,
                                    },
                                    livenessProbe: {
                                        httpGet: { path: "/", port: 2021 },
                                        initialDelaySeconds: 10,
                                        periodSeconds: 30,
                                    },
                                    readinessProbe: {
                                        httpGet: { path: "/", port: 2021 },
                                        initialDelaySeconds: 5,
                                        periodSeconds: 10,
                                        failureThreshold: 3,
                                    },
                                    resources: {
                                        requests: { cpu: "50m", memory: "64Mi" },
                                        limits: { cpu: "500m", memory: "256Mi" },
                                    },
                                    securityContext: {
                                        allowPrivilegeEscalation: false,
                                        capabilities: { drop: ["ALL"] },
                                    },
                                },
                            ],
                        },
                    },
                },
            },
            { parent: this, dependsOn: [pvc, secret], aliases: [{ parent: pulumi.rootStackResource }] },
        );

        const service = new kubernetes.core.v1.Service(
            "donetick",
            {
                metadata: { name: "donetick", namespace: "default" },
                spec: {
                    type: "ClusterIP" as const,
                    selector: { app: "donetick" },
                    ports: [{ port: 2021, targetPort: 2021 }],
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }], ignoreChanges: SERVICE_IGNORE_CHANGES },
        );

        makeTailscaleIngress(
            "donetick",
            "donetick",
            service.metadata.name,
            2021,
            "default",
            { parent: this, dependsOn: [service], aliases: [{ parent: pulumi.rootStackResource }] },
        );

        this.registerOutputs({});
    }
}

new DonetickStack("donetick");
