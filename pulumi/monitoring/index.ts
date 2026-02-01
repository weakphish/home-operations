import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

const tailscaleStack = new pulumi.StackReference("tailscale-stack", {
    name: "weakphish/tailscale/homelab",
});

const config = new pulumi.Config();
const k8sNamespace = config.get("k8sNamespace") || "monitoring";

// Create the monitoring namespace
const namespace = new k8s.core.v1.Namespace("monitoring-ns", {
    metadata: {
        name: k8sNamespace,
        labels: {
            app: "monitoring",
        },
    },
});

// Deploy kube-prometheus-stack
const prometheusStack = new k8s.helm.v3.Release("kube-prometheus-stack", {
    name: "prometheus",  // Fixed release name for predictable service names
    chart: "kube-prometheus-stack",
    namespace: k8sNamespace,
    repositoryOpts: {
        repo: "https://prometheus-community.github.io/helm-charts",
    },
    values: {
        // Use shorter names for services
        fullnameOverride: "prometheus",
        // Grafana configuration
        grafana: {
            enabled: true,
            persistence: {
                enabled: true,
                size: "10Gi",
            },
            service: {
                type: "ClusterIP",
            },
        },
        // Prometheus configuration
        prometheus: {
            prometheusSpec: {
                retention: "15d",
                storageSpec: {
                    volumeClaimTemplate: {
                        spec: {
                            accessModes: ["ReadWriteOnce"],
                            resources: {
                                requests: {
                                    storage: "50Gi",
                                },
                            },
                        },
                    },
                },
            },
        },
        // Alertmanager configuration
        alertmanager: {
            alertmanagerSpec: {
                storage: {
                    volumeClaimTemplate: {
                        spec: {
                            accessModes: ["ReadWriteOnce"],
                            resources: {
                                requests: {
                                    storage: "10Gi",
                                },
                            },
                        },
                    },
                },
            },
        },
    },
}, { dependsOn: [namespace] });

// Expose Grafana via Tailscale Ingress
const grafanaIngress = new k8s.networking.v1.Ingress("grafana-ingress", {
    metadata: {
        namespace: k8sNamespace,
    },
    spec: {
        ingressClassName: "tailscale",
        defaultBackend: {
            service: {
                name: "prometheus-grafana",
                port: {
                    number: 80,
                },
            },
        },
        tls: [
            {
                hosts: ["grafana"],
            },
        ],
    },
}, { dependsOn: [prometheusStack, tailscaleStack] });

// Expose Prometheus via Tailscale Ingress
const prometheusIngress = new k8s.networking.v1.Ingress("prometheus-ingress", {
    metadata: {
        namespace: k8sNamespace,
    },
    spec: {
        ingressClassName: "tailscale",
        defaultBackend: {
            service: {
                name: "prometheus-prometheus",
                port: {
                    number: 9090,
                },
            },
        },
        tls: [
            {
                hosts: ["prometheus"],
            },
        ],
    },
}, { dependsOn: [prometheusStack, tailscaleStack] });

// Expose Alertmanager via Tailscale Ingress
const alertmanagerIngress = new k8s.networking.v1.Ingress("alertmanager-ingress", {
    metadata: {
        namespace: k8sNamespace,
    },
    spec: {
        ingressClassName: "tailscale",
        defaultBackend: {
            service: {
                name: "prometheus-alertmanager",
                port: {
                    number: 9093,
                },
            },
        },
        tls: [
            {
                hosts: ["alertmanager"],
            },
        ],
    },
}, { dependsOn: [prometheusStack, tailscaleStack] });

export { namespace, prometheusStack, grafanaIngress, prometheusIngress, alertmanagerIngress };
