// To import existing resources into this stack, run:
//   pulumi import 'kubernetes:core/v1:PersistentVolumeClaim' foundry-data 'default/foundry-data-claim'
//   pulumi import 'kubernetes:core/v1:Secret' foundry-secret 'default/foundry-secret'
//   pulumi import 'kubernetes:apps/v1:Deployment' foundry 'default/foundry'
//   pulumi import 'kubernetes:core/v1:Service' foundry 'default/foundry'
//   pulumi import 'kubernetes:networking.k8s.io/v1:Ingress' foundry 'default/foundry'

import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";
import { makeLonghornPVC, makeTailscaleIngress, SERVICE_IGNORE_CHANGES } from "../lib/k8s";

const config = new pulumi.Config();
const foundryUsername = config.requireSecret("foundryUsername");
const foundryPassword = config.requireSecret("foundryPassword");

/**
 * Provisions all Kubernetes resources for Foundry VTT.
 *
 * Accessible via Tailscale Ingress (private) and Cloudflare Tunnel (public,
 * managed by the cloudflared + cf-tunnel stacks).
 */
class FoundryStack extends pulumi.ComponentResource {
    /** The Kubernetes Service name, exported for use by cloudflared routing config. */
    public readonly serviceName: pulumi.Output<string>;

    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("homelab:apps:FoundryStack", name, {}, opts);

        const pvc = makeLonghornPVC(
            "foundry-data",
            "foundry-data-claim",
            "50Gi",
            "default",
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        const secret = new kubernetes.core.v1.Secret(
            "foundry-secret",
            {
                metadata: { name: "foundry-secret", namespace: "default" },
                type: "Opaque",
                stringData: {
                    username: foundryUsername,
                    password: foundryPassword,
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        new kubernetes.apps.v1.Deployment(
            "foundry",
            {
                metadata: { name: "foundry", namespace: "default" },
                spec: {
                    replicas: 1,
                    selector: { matchLabels: { app: "foundry" } },
                    // Recreate strategy: Foundry stores worlds, assets, and configuration
                    // in files on the PVC. If two pods ran simultaneously (as Rolling Update
                    // allows briefly), both would write to the same files, risking corruption.
                    // Recreate stops the old pod completely before the new one starts.
                    strategy: { type: "Recreate" },
                    template: {
                        metadata: { labels: { app: "foundry" } },
                        spec: {
                            volumes: [
                                {
                                    name: "foundry-data",
                                    persistentVolumeClaim: { claimName: pvc.metadata.name },
                                },
                            ],
                            containers: [
                                {
                                    name: "foundry",
                                    image: "felddy/foundryvtt:release",
                                    ports: [{ containerPort: 30000 }],
                                    env: [
                                        {
                                            name: "FOUNDRY_USERNAME",
                                            valueFrom: {
                                                secretKeyRef: {
                                                    name: secret.metadata.name,
                                                    key: "username",
                                                },
                                            },
                                        },
                                        {
                                            name: "FOUNDRY_PASSWORD",
                                            valueFrom: {
                                                secretKeyRef: {
                                                    name: secret.metadata.name,
                                                    key: "password",
                                                },
                                            },
                                        },
                                    ],
                                    volumeMounts: [
                                        { name: "foundry-data", mountPath: "/data" },
                                    ],
                                    resources: {
                                        requests: { cpu: "100m", memory: "256Mi" },
                                        limits: { cpu: "1000m", memory: "1Gi" },
                                    },
                                    securityContext: {
                                        allowPrivilegeEscalation: false,
                                        capabilities: { drop: ["ALL"] },
                                    },
                                    readinessProbe: {
                                        httpGet: { path: "/", port: 30000 },
                                        initialDelaySeconds: 60,
                                        periodSeconds: 15,
                                        failureThreshold: 5,
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
            "foundry",
            {
                metadata: { name: "foundry", namespace: "default" },
                spec: {
                    type: "ClusterIP" as const,
                    selector: { app: "foundry" },
                    ports: [{ name: "foundry-port", port: 30000, targetPort: 30000 }],
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }], ignoreChanges: SERVICE_IGNORE_CHANGES },
        );

        makeTailscaleIngress(
            "foundry",
            "foundry",
            service.metadata.name,
            30000,
            "default",
            { parent: this, dependsOn: [service], aliases: [{ parent: pulumi.rootStackResource }] },
        );

        this.serviceName = service.metadata.name;
        this.registerOutputs({ serviceName: this.serviceName });
    }
}

const stack = new FoundryStack("foundry");

export const foundryServiceName = stack.serviceName;
