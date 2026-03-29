import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";

/**
 * Ignore-list for ClusterIP Services — fields K8s auto-assigns on creation that
 * Pulumi would otherwise try to null out on every subsequent update.
 *
 * Apply to every `kubernetes.core.v1.Service` with `type: ClusterIP` via:
 * `ignoreChanges: SERVICE_IGNORE_CHANGES`
 */
export const SERVICE_IGNORE_CHANGES = [
    "spec.clusterIP",
    "spec.clusterIPs",
    "spec.internalTrafficPolicy",
    "spec.ipFamilies",
];

/**
 * Creates a Tailscale Ingress that routes all traffic to a single backend service.
 *
 * All HTTP apps in this homelab use `ingressClassName: tailscale` for private
 * access via `*.pipefish-manta.ts.net`. This helper standardises the hostname
 * annotation, TLS block, and `defaultBackend` so each stack doesn't repeat them.
 *
 * @param resourceName - Pulumi logical resource name. Also used as the K8s
 *                       `metadata.name`.
 * @param hostname     - Tailscale hostname (e.g. `"foundry"`). Used for the
 *                       `tailscale.com/hostname` annotation and the TLS host entry.
 * @param serviceName  - The backing Service name, typically `service.metadata.name`.
 * @param port         - The Service port number to forward to.
 * @param namespace    - Kubernetes namespace (default: `"default"`).
 * @param opts         - Pulumi resource options (parent, dependsOn, aliases, etc.).
 * @returns The created Ingress resource.
 */
export function makeTailscaleIngress(
    resourceName: string,
    hostname: string,
    serviceName: pulumi.Input<string>,
    port: number,
    namespace = "default",
    opts: pulumi.CustomResourceOptions,
): kubernetes.networking.v1.Ingress {
    return new kubernetes.networking.v1.Ingress(
        resourceName,
        {
            metadata: {
                name: resourceName,
                namespace,
                annotations: { "tailscale.com/hostname": hostname },
            },
            spec: {
                ingressClassName: "tailscale",
                defaultBackend: {
                    service: {
                        name: serviceName,
                        port: { number: port },
                    },
                },
                tls: [{ hosts: [hostname] }],
            },
        },
        opts,
    );
}

/**
 * Creates a Longhorn-backed PersistentVolumeClaim with the standard options
 * used across all app stacks.
 *
 * All PVCs in this homelab use `storageClassName: longhorn`, `ReadWriteOnce`
 * access, and share the same `ignoreChanges` fields that Longhorn populates at
 * bind time (`spec.volumeName`, `metadata.annotations`, `metadata.labels`).
 * These are merged into `opts` automatically so call sites don't repeat them.
 *
 * @param resourceName - Pulumi logical resource name.
 * @param claimName    - The `metadata.name` of the PVC in Kubernetes.
 * @param size         - Storage request string (e.g. `"10Gi"`).
 * @param namespace    - Kubernetes namespace (default: `"default"`).
 * @param opts         - Pulumi resource options (parent, aliases, etc.).
 * @returns The created PersistentVolumeClaim resource.
 */
export function makeLonghornPVC(
    resourceName: string,
    claimName: string,
    size: string,
    namespace = "default",
    opts: pulumi.CustomResourceOptions,
): kubernetes.core.v1.PersistentVolumeClaim {
    return new kubernetes.core.v1.PersistentVolumeClaim(
        resourceName,
        {
            metadata: { name: claimName, namespace },
            spec: {
                storageClassName: "longhorn",
                accessModes: ["ReadWriteOnce"],
                resources: { requests: { storage: size } },
            },
        },
        pulumi.mergeOptions(opts, {
            ignoreChanges: ["spec.volumeName", "metadata.annotations", "metadata.labels"],
        }),
    );
}
