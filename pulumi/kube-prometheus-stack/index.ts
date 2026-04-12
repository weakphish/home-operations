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

        // NetworkPolicy for the Prometheus server: restricts ingress to Grafana only and
        // egress to K8s API + scrape targets. No `to:` restriction on the K8s API ports
        // because K3s evaluates NetworkPolicy post-DNAT — ClusterIP 10.43.0.1:443 is
        // translated to the node IP on port 6443 before the policy is evaluated, so
        // matching on port 443 alone would never work.
        new kubernetes.networking.v1.NetworkPolicy(
            "prometheus-network-policy",
            {
                metadata: { name: "prometheus", namespace: "default" },
                spec: {
                    podSelector: {
                        matchLabels: { "app.kubernetes.io/name": "prometheus" },
                    },
                    policyTypes: ["Ingress", "Egress"],
                    ingress: [
                        {
                            from: [
                                {
                                    podSelector: {
                                        matchLabels: { "app.kubernetes.io/name": "grafana" },
                                    },
                                },
                            ],
                            ports: [{ port: 9090, protocol: "TCP" }],
                        },
                    ],
                    egress: [
                        // K8s API for service discovery — no `to:` because K3s post-DNAT
                        // translates 10.43.0.1:443 → node_ip:6443 before policy evaluation.
                        {
                            ports: [
                                { port: 443, protocol: "TCP" },
                                { port: 6443, protocol: "TCP" },
                            ],
                        },
                        // node-exporter runs on host network (node IP, port 9100);
                        // kubelet metrics also run on host network (port 10250).
                        // No `to:` restriction covers both host and pod IPs.
                        {
                            ports: [
                                { port: 9100, protocol: "TCP" },
                                { port: 10250, protocol: "TCP" },
                            ],
                        },
                        // In-cluster scrape targets: alertmanager, self-scrape, coredns,
                        // kube-state-metrics, and various /metrics sidecar ports.
                        {
                            ports: [
                                { port: 8080, protocol: "TCP" },
                                { port: 9090, protocol: "TCP" },
                                { port: 9093, protocol: "TCP" },
                                { port: 9153, protocol: "TCP" },
                            ],
                            to: [{ podSelector: {} }],
                        },
                    ],
                },
            },
            { parent: this },
        );

        // NetworkPolicy for Alertmanager: allows ingress from Prometheus (scrape + alerts)
        // and Tailscale (UI access). Egress is handled by global allow policies.
        new kubernetes.networking.v1.NetworkPolicy(
            "alertmanager-network-policy",
            {
                metadata: { name: "alertmanager", namespace: "default" },
                spec: {
                    podSelector: {
                        matchLabels: { "app.kubernetes.io/name": "alertmanager" },
                    },
                    policyTypes: ["Ingress"],
                    ingress: [
                        {
                            from: [
                                {
                                    podSelector: {
                                        matchLabels: { "app.kubernetes.io/name": "prometheus" },
                                    },
                                },
                            ],
                            ports: [
                                { port: 9093, protocol: "TCP" },
                                { port: 8080, protocol: "TCP" },
                            ],
                        },
                    ],
                },
            },
            { parent: this },
        );

        // NetworkPolicy for the Prometheus Operator: only needs K8s API access to
        // reconcile Prometheus, Alertmanager, and ServiceMonitor CRs. Same post-DNAT
        // reasoning as above — must allow port 6443 with no `to:` restriction.
        new kubernetes.networking.v1.NetworkPolicy(
            "prometheus-operator-network-policy",
            {
                metadata: { name: "prometheus-operator", namespace: "default" },
                spec: {
                    podSelector: {
                        matchLabels: { "app.kubernetes.io/name": "kube-prometheus-stack-prometheus-operator" },
                    },
                    policyTypes: ["Egress"],
                    egress: [
                        {
                            ports: [
                                { port: 443, protocol: "TCP" },
                                { port: 6443, protocol: "TCP" },
                            ],
                        },
                    ],
                },
            },
            { parent: this },
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
