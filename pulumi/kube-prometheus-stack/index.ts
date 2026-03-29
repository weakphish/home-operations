// To import existing resources into this stack, run:
//   pulumi import 'kubernetes:helm.sh/v3:Release' kube-prometheus-stack 'default/kube-prometheus-stack'

import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";

/**
 * Deploys the kube-prometheus-stack Helm chart: Prometheus Operator, Prometheus,
 * Alertmanager, kube-state-metrics, and node-exporter. Grafana is disabled — it
 * lives in its own stack.
 */
class KubePrometheusStack extends pulumi.ComponentResource {
    /** The Helm release resource. */
    public readonly release: kubernetes.helm.v3.Release;

    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("homelab:monitoring:KubePrometheusStack", name, {}, opts);

        this.release = new kubernetes.helm.v3.Release(
            "kube-prometheus-stack",
            {
                name: "kube-prometheus-stack",
                namespace: "default",
                chart: "kube-prometheus-stack",
                version: "82.15.1",
                repositoryOpts: {
                    repo: "https://prometheus-community.github.io/helm-charts",
                },
                values: {
                    // These components are not present in a K3s single-node cluster.
                    // Disabling them prevents harmless but noisy "component unreachable"
                    // alerts from firing.
                    kubeControllerManager: { enabled: false },
                    kubeScheduler: { enabled: false },
                    kubeEtcd: { enabled: false },

                    // Grafana is managed by its own Pulumi stack with its own chart,
                    // PVC, credentials, and ingress. Disable the one bundled here.
                    grafana: { enabled: false },

                    "kube-state-metrics": {
                        resources: {
                            requests: { cpu: "10m", memory: "64Mi" },
                            limits: { memory: "128Mi" },
                        },
                    },

                    "prometheus-node-exporter": {
                        extraArgs: [
                            "--collector.systemd",
                            "--collector.processes",
                        ],
                        resources: {
                            requests: { cpu: "10m", memory: "32Mi" },
                            limits: { memory: "64Mi" },
                        },
                        prometheus: {
                            monitor: {
                                relabelings: [
                                    { targetLabel: "job", replacement: "node" },
                                ],
                            },
                        },
                    },

                    alertmanager: {
                        alertmanagerSpec: {
                            resources: {
                                requests: { cpu: "10m", memory: "32Mi" },
                                limits: { memory: "64Mi" },
                            },
                        },
                    },

                    prometheus: {
                        prometheusSpec: {
                            // 30s matches the timeInterval set in the Grafana Prometheus
                            // datasource — mismatching intervals cause "no data" gaps in panels
                            scrapeInterval: "30s",
                            evaluationInterval: "30s",
                            resources: {
                                requests: { cpu: "100m", memory: "256Mi" },
                                limits: { memory: "768Mi" },
                            },
                        },
                    },
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        this.registerOutputs({ releaseName: this.release.name });
    }
}

const stack = new KubePrometheusStack("kube-prometheus-stack");

export const prometheusServiceUrl =
    "http://kube-prometheus-stack-prometheus.default.svc.cluster.local:9090";

export const alertmanagerServiceUrl =
    "http://kube-prometheus-stack-alertmanager.default.svc.cluster.local:9093";

export const releaseName = stack.release.name;
