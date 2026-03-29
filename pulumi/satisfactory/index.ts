// To import existing resources into this stack, run:
//   pulumi import 'kubernetes:core/v1:PersistentVolumeClaim' satisfactory-data 'default/satisfactory-claim'
//   pulumi import 'kubernetes:apps/v1:Deployment' satisfactory 'default/satisfactory'
//   pulumi import 'kubernetes:core/v1:Service' satisfactory 'default/satisfactory'

import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";
import { makeLonghornPVC, SERVICE_IGNORE_CHANGES } from "../lib/k8s";

/**
 * Provisions the Satisfactory dedicated game server.
 *
 * Uses a LoadBalancer Service with loadBalancerClass: tailscale rather than an
 * Ingress — Ingress only handles HTTP/HTTPS and cannot route Satisfactory's UDP
 * game traffic.
 */
class SatisfactoryStack extends pulumi.ComponentResource {
    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("homelab:apps:SatisfactoryStack", name, {}, opts);

        const pvc = makeLonghornPVC(
            "satisfactory-data",
            "satisfactory-claim",
            "25Gi",
            "default",
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        new kubernetes.apps.v1.Deployment(
            "satisfactory",
            {
                metadata: {
                    name: "satisfactory",
                    namespace: "default",
                    labels: { app: "satisfactory" },
                },
                spec: {
                    replicas: 1,
                    selector: { matchLabels: { app: "satisfactory" } },
                    // Recreate strategy: game servers maintain in-memory world state.
                    // Running two instances simultaneously would create two separate game
                    // sessions, not a handoff. Players would disconnect and reconnect to
                    // a fresh (and possibly corrupted) server state.
                    strategy: { type: "Recreate" },
                    template: {
                        metadata: { labels: { app: "satisfactory" } },
                        spec: {
                            volumes: [
                                {
                                    name: "satisfactory-config",
                                    persistentVolumeClaim: { claimName: pvc.metadata.name },
                                },
                            ],
                            containers: [
                                {
                                    name: "satisfactory",
                                    image: "wolveix/satisfactory-server:v1.9.10",
                                    ports: [
                                        { containerPort: 7777, protocol: "TCP" },
                                        { containerPort: 7777, protocol: "UDP" },
                                        { containerPort: 8888, protocol: "TCP" },
                                    ],
                                    env: [
                                        { name: "MAXPLAYERS", value: "4" },
                                        // PGID/PUID: the container runs as this Linux user/group.
                                        // These must match the ownership of the mounted PVC data —
                                        // if they mismatch, the server can't read or write save files.
                                        { name: "PGID", value: "1000" },
                                        { name: "PUID", value: "1000" },
                                    ],
                                    volumeMounts: [
                                        { name: "satisfactory-config", mountPath: "/config" },
                                    ],
                                    resources: {
                                        requests: { cpu: "500m", memory: "2Gi" },
                                        limits: { cpu: "4000m", memory: "8Gi" },
                                    },
                                    readinessProbe: {
                                        tcpSocket: { port: 8888 },
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
            { parent: this, dependsOn: [pvc], aliases: [{ parent: pulumi.rootStackResource }] },
        );

        new kubernetes.core.v1.Service(
            "satisfactory",
            {
                metadata: {
                    name: "satisfactory",
                    namespace: "default",
                    labels: { app: "satisfactory" },
                    annotations: { "tailscale.com/hostname": "satisfactory" },
                },
                spec: {
                    type: "LoadBalancer",
                    loadBalancerClass: "tailscale",
                    selector: { app: "satisfactory" },
                    ports: [
                        { name: "game-tcp", port: 7777, targetPort: 7777, protocol: "TCP" },
                        { name: "game-udp", port: 7777, targetPort: 7777, protocol: "UDP" },
                        { name: "messaging", port: 8888, targetPort: 8888, protocol: "TCP" },
                    ],
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }], ignoreChanges: SERVICE_IGNORE_CHANGES },
        );

        this.registerOutputs({});
    }
}

new SatisfactoryStack("satisfactory");
