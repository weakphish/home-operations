// To import existing resources into this stack, run:
//   pulumi import 'kubernetes:helm.sh/v3:Release' grafana 'default/grafana'
//   pulumi import 'kubernetes:core/v1:Secret' grafana-admin-secret 'default/grafana-admin-secret'
//   pulumi import 'kubernetes:core/v1:ConfigMap' prometheus-datasource 'default/prometheus-datasource'
//   pulumi import 'kubernetes:core/v1:ConfigMap' loki-datasource 'default/loki-datasource'

import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";

const kubePromStack = new pulumi.StackReference("organization/kube-prometheus-stack/homelab");
const lokiStack = new pulumi.StackReference("organization/loki/homelab");

const prometheusUrl = kubePromStack.requireOutput("prometheusServiceUrl");
const lokiUrl = lokiStack.requireOutput("lokiServiceUrl");

const config = new pulumi.Config();
const adminUser = config.requireSecret("adminUser");
const adminPassword = config.requireSecret("adminPassword");

/**
 * Provisions all Kubernetes resources for Grafana.
 *
 * The Helm chart's sidecar watches for ConfigMaps labeled `grafana_datasource: "1"`
 * and hot-loads them as datasources without requiring a pod restart. This stack
 * creates those ConfigMaps for Prometheus and Loki.
 */
class GrafanaStack extends pulumi.ComponentResource {
    /** The Grafana Helm release. */
    public readonly release: kubernetes.helm.v3.Release;

    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("homelab:monitoring:GrafanaStack", name, {}, opts);

        const adminSecret = new kubernetes.core.v1.Secret(
            "grafana-admin-secret",
            {
                metadata: { name: "grafana-admin-secret", namespace: "default" },
                type: "Opaque",
                stringData: {
                    "admin-user": adminUser,
                    "admin-password": adminPassword,
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        // `grafana_datasource: "1"` is the label the Grafana sidecar watches for.
        const prometheusDatasource = new kubernetes.core.v1.ConfigMap(
            "prometheus-datasource",
            {
                metadata: {
                    name: "prometheus-datasource",
                    namespace: "default",
                    labels: { grafana_datasource: "1" },
                },
                data: {
                    "prometheus-datasource.yaml": pulumi.interpolate`apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: ${prometheusUrl}
    isDefault: true
    jsonData:
      timeInterval: 30s
`,
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        const lokiDatasource = new kubernetes.core.v1.ConfigMap(
            "loki-datasource",
            {
                metadata: {
                    name: "loki-datasource",
                    namespace: "default",
                    labels: { grafana_datasource: "1" },
                },
                data: {
                    "loki-datasource.yaml": pulumi.interpolate`apiVersion: 1
datasources:
  - name: Loki
    type: loki
    access: proxy
    url: ${lokiUrl}
    isDefault: false
    jsonData:
      maxLines: 1000
`,
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        this.release = new kubernetes.helm.v3.Release(
            "grafana",
            {
                name: "grafana",
                namespace: "default",
                chart: "grafana",
                version: "11.3.6",
                repositoryOpts: {
                    repo: "https://grafana-community.github.io/helm-charts",
                },
                values: {
                    persistence: {
                        enabled: true,
                        storageClassName: "longhorn",
                        size: "10Gi",
                    },
                    service: { type: "ClusterIP" },
                    // Inline ingress via chart values (tailscale Ingress class)
                    ingress: {
                        enabled: true,
                        ingressClassName: "tailscale",
                        annotations: { "tailscale.com/hostname": "grafana" },
                        hosts: ["grafana"],
                        tls: [{ hosts: ["grafana"] }],
                    },
                    "grafana.ini": {
                        server: { root_url: "https://grafana.pipefish-manta.ts.net" },
                        "auth.basic": { enabled: true },
                    },
                    resources: {
                        requests: { cpu: "50m", memory: "128Mi" },
                        limits: { memory: "256Mi" },
                    },
                    admin: {
                        existingSecret: adminSecret.metadata.name,
                        userKey: "admin-user",
                        passwordKey: "admin-password",
                    },
                    sidecar: {
                        dashboards: {
                            enabled: true,
                            env: { HEALTHCHECK_PORT: "9004" },
                        },
                        datasources: { enabled: true },
                    },
                },
            },
            { parent: this, dependsOn: [adminSecret, prometheusDatasource, lokiDatasource], aliases: [{ parent: pulumi.rootStackResource }] },
        );

        this.registerOutputs({ releaseName: this.release.name });
    }
}

const stack = new GrafanaStack("grafana");
export const releaseName = stack.release.name;
