// To import existing resources into this stack, run:
//   pulumi import 'kubernetes:helm.sh/v3:Release' alloy 'default/alloy'

import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";

const lokiStack = new pulumi.StackReference("organization/loki/homelab");
const lokiServiceUrl = lokiStack.requireOutput("lokiServiceUrl");

/**
 * Deploys Grafana Alloy as a DaemonSet log collector that tails pod logs from
 * each node's filesystem, collects Kubernetes events, and ships to Loki.
 *
 * Runs as a DaemonSet because pod log files live on the node filesystem — a
 * Deployment would only run on one node and miss logs from all others.
 */
class AlloyStack extends pulumi.ComponentResource {
    /** The Alloy Helm release. */
    public readonly release: kubernetes.helm.v3.Release;

    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("homelab:monitoring:AlloyStack", name, {}, opts);

        const alloyConfig = pulumi.interpolate`
// Discover all pods (single-node cluster, no node filtering needed)
discovery.kubernetes "pods" {
  role = "pod"
}

// Relabel to extract useful metadata as Loki labels
discovery.relabel "pods" {
  targets = discovery.kubernetes.pods.targets

  rule {
    source_labels = ["__meta_kubernetes_namespace"]
    target_label  = "namespace"
  }
  rule {
    source_labels = ["__meta_kubernetes_pod_name"]
    target_label  = "pod"
  }
  rule {
    source_labels = ["__meta_kubernetes_pod_container_name"]
    target_label  = "container"
  }
  rule {
    source_labels = ["__meta_kubernetes_namespace", "__meta_kubernetes_pod_name"]
    separator     = "/"
    target_label  = "job"
  }
}

// Tail pod logs from /var/log/pods on the node filesystem.
// The Kubelet writes every container's stdout/stderr to structured files under
// this directory. Alloy tails these files in real-time.
loki.source.kubernetes "pods" {
  targets    = discovery.relabel.pods.output
  forward_to = [loki.write.local.receiver]
}

// K8s events are ephemeral — they disappear after ~1 hour by default.
// Alloy captures them here so they persist in Loki.
loki.source.kubernetes_events "events" {
  forward_to = [loki.write.local.receiver]
}

// Ship to Loki
loki.write "local" {
  endpoint {
    url = "${lokiServiceUrl}/loki/api/v1/push"
  }
}
`;

        this.release = new kubernetes.helm.v3.Release(
            "alloy",
            {
                name: "alloy",
                namespace: "default",
                chart: "alloy",
                version: "1.6.2",
                repositoryOpts: {
                    repo: "https://grafana.github.io/helm-charts",
                },
                values: {
                    alloy: {
                        resources: {
                            requests: { cpu: "50m", memory: "64Mi" },
                            limits: { memory: "256Mi" },
                        },
                        // varlog: true mounts /var/log from the host node into each Alloy pod.
                        // Without this, Alloy cannot read the pod log files written by Kubelet.
                        mounts: { varlog: true },
                        configMap: {
                            content: alloyConfig,
                        },
                    },
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        this.registerOutputs({ releaseName: this.release.name });
    }
}

const stack = new AlloyStack("alloy");
export const releaseName = stack.release.name;
