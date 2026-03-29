// To import existing resources into this stack, run:
//   pulumi import 'kubernetes:core/v1:Namespace' longhorn-system 'longhorn-system'
//   pulumi import 'kubernetes:helm.sh/v3:Release' longhorn 'longhorn-system/longhorn'
//   pulumi import 'kubernetes:networking.k8s.io/v1:Ingress' longhorn 'longhorn-system/longhorn'

import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";
import { makeTailscaleIngress } from "../lib/k8s";

/**
 * Provisions the Longhorn distributed block storage operator in its own namespace.
 * Provides dynamic PVC provisioning (storageClassName: longhorn) for all app stacks.
 */
class LonghornStack extends pulumi.ComponentResource {
    /** The Longhorn Helm release resource. */
    public readonly release: kubernetes.helm.v3.Release;

    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("homelab:storage:LonghornStack", name, {}, opts);

        const ns = new kubernetes.core.v1.Namespace(
            "longhorn-system",
            { metadata: { name: "longhorn-system" } },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        // defaultReplicaCount: 1 — on a single-node cluster there is nowhere else
        // to place replicas. Without this, volumes get stuck "degraded" waiting for
        // a second node that never arrives.
        this.release = new kubernetes.helm.v3.Release(
            "longhorn",
            {
                name: "longhorn",
                namespace: "longhorn-system",
                chart: "longhorn",
                repositoryOpts: { repo: "https://charts.longhorn.io" },
                values: {
                    defaultSettings: {
                        defaultReplicaCount: 1,
                    },
                },
            },
            { parent: this, dependsOn: [ns], aliases: [{ parent: pulumi.rootStackResource }] },
        );

        makeTailscaleIngress(
            "longhorn",
            "longhorn",
            "longhorn-frontend",
            80,
            "longhorn-system",
            { parent: this, dependsOn: [this.release], aliases: [{ parent: pulumi.rootStackResource }] },
        );

        this.registerOutputs({ releaseName: this.release.name });
    }
}

const stack = new LonghornStack("longhorn");

export const releaseName = stack.release.name;
