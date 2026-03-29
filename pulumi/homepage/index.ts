// To import existing resources into this stack, run:
//   pulumi import 'kubernetes:core/v1:ServiceAccount' homepage 'default/homepage'
//   pulumi import 'kubernetes:rbac.authorization.k8s.io/v1:ClusterRole' homepage 'homepage'
//   pulumi import 'kubernetes:rbac.authorization.k8s.io/v1:ClusterRoleBinding' homepage 'homepage'
//   pulumi import 'kubernetes:rbac.authorization.k8s.io/v1:Role' homepage 'default/homepage'
//   pulumi import 'kubernetes:rbac.authorization.k8s.io/v1:RoleBinding' homepage 'default/homepage'
//   pulumi import 'kubernetes:core/v1:ConfigMap' homepage 'default/homepage'
//   pulumi import 'kubernetes:apps/v1:Deployment' homepage 'default/homepage'
//   pulumi import 'kubernetes:core/v1:Service' homepage 'default/homepage'
//   pulumi import 'kubernetes:networking.k8s.io/v1:Ingress' homepage 'default/homepage'

import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";
import { makeTailscaleIngress, SERVICE_IGNORE_CHANGES } from "../lib/k8s";

/**
 * Provisions all Kubernetes resources for the Homepage dashboard.
 *
 * Homepage reads the Kubernetes API to show live service status — requires a
 * ClusterRole (for cluster-scoped resources like nodes) and a namespace Role
 * (for workload resources). Configuration lives in a ConfigMap mounted as files.
 */
class HomepageStack extends pulumi.ComponentResource {
    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("homelab:apps:HomepageStack", name, {}, opts);

        const sa = new kubernetes.core.v1.ServiceAccount(
            "homepage",
            {
                metadata: {
                    name: "homepage",
                    namespace: "default",
                    labels: { "app.kubernetes.io/name": "homepage" },
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        // ClusterRole for cluster-scoped resources (nodes have no namespace, so a
        // namespace Role cannot grant access to them).
        const clusterRole = new kubernetes.rbac.v1.ClusterRole(
            "homepage",
            {
                metadata: {
                    name: "homepage",
                    labels: { "app.kubernetes.io/name": "homepage" },
                },
                rules: [
                    {
                        apiGroups: [""],
                        resources: ["nodes", "namespaces"],
                        verbs: ["get", "list"],
                    },
                    {
                        apiGroups: ["metrics.k8s.io"],
                        resources: ["nodes", "pods"],
                        verbs: ["get", "list"],
                    },
                ],
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        new kubernetes.rbac.v1.ClusterRoleBinding(
            "homepage",
            {
                metadata: {
                    name: "homepage",
                    labels: { "app.kubernetes.io/name": "homepage" },
                },
                roleRef: {
                    apiGroup: "rbac.authorization.k8s.io",
                    kind: "ClusterRole",
                    name: clusterRole.metadata.name,
                },
                subjects: [{ kind: "ServiceAccount", name: "homepage", namespace: "default" }],
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        const role = new kubernetes.rbac.v1.Role(
            "homepage",
            {
                metadata: {
                    name: "homepage",
                    namespace: "default",
                    labels: { "app.kubernetes.io/name": "homepage" },
                },
                rules: [
                    { apiGroups: [""], resources: ["pods", "services"], verbs: ["get", "list"] },
                    { apiGroups: ["networking.k8s.io"], resources: ["ingresses"], verbs: ["get", "list"] },
                    { apiGroups: ["apps"], resources: ["deployments"], verbs: ["get", "list"] },
                ],
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        new kubernetes.rbac.v1.RoleBinding(
            "homepage",
            {
                metadata: {
                    name: "homepage",
                    namespace: "default",
                    labels: { "app.kubernetes.io/name": "homepage" },
                },
                roleRef: {
                    apiGroup: "rbac.authorization.k8s.io",
                    kind: "Role",
                    name: role.metadata.name,
                },
                subjects: [{ kind: "ServiceAccount", name: "homepage", namespace: "default" }],
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        const configMap = new kubernetes.core.v1.ConfigMap(
            "homepage",
            {
                metadata: {
                    name: "homepage",
                    namespace: "default",
                    labels: { "app.kubernetes.io/name": "homepage" },
                },
                data: {
                    "kubernetes.yaml": "mode: cluster\n",
                    "settings.yaml": [
                        "title: homelab",
                        "headerStyle: clean",
                        "layout:",
                        "  Infrastructure:",
                        "    style: row",
                        "    columns: 4",
                        "  Personal:",
                        "    style: row",
                        "    columns: 2",
                        "  Gaming:",
                        "    style: row",
                        "    columns: 2",
                    ].join("\n") + "\n",
                    "services.yaml": [
                        "- Infrastructure:",
                        "    - Grafana:",
                        "        href: https://grafana.pipefish-manta.ts.net",
                        "        description: Monitoring & Dashboards",
                        "        icon: grafana",
                        "    - Longhorn:",
                        "        href: https://longhorn.pipefish-manta.ts.net",
                        "        description: Block Storage",
                        "        icon: longhorn",
                        "    - Prometheus:",
                        "        description: Metrics (internal)",
                        "        icon: prometheus",
                        "    - Loki:",
                        "        description: Log aggregation (internal)",
                        "        icon: loki",
                        "- Personal:",
                        "    - Paperless:",
                        "        href: https://paperless.pipefish-manta.ts.net",
                        "        description: Document management",
                        "        icon: paperless-ngx",
                        "    - Donetick:",
                        "        href: https://donetick.pipefish-manta.ts.net",
                        "        description: Chores & tasks",
                        "        icon: donetick",
                        "- Gaming:",
                        "    - Foundry VTT:",
                        "        href: https://foundry.pipefish-manta.ts.net",
                        "        description: D&D Virtual Tabletop",
                        "        icon: foundry-vtt",
                        "    - Satisfactory:",
                        "        description: Factory game server (UDP)",
                        "        icon: satisfactory",
                    ].join("\n") + "\n",
                    "widgets.yaml": [
                        "- kubernetes:",
                        "    cluster:",
                        "      show: true",
                        "      cpu: true",
                        "      memory: true",
                        "      showLabel: true",
                        "      label: new-bermuda",
                        "    nodes:",
                        "      show: true",
                        "      cpu: true",
                        "      memory: true",
                        "      showLabel: true",
                        "- datetime:",
                        "    text_size: l",
                        "    format:",
                        "      timeStyle: short",
                        "      dateStyle: short",
                    ].join("\n") + "\n",
                    "bookmarks.yaml": "\n",
                    "custom.css": "",
                    "custom.js": "",
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }] },
        );

        new kubernetes.apps.v1.Deployment(
            "homepage",
            {
                metadata: {
                    name: "homepage",
                    namespace: "default",
                    labels: { "app.kubernetes.io/name": "homepage" },
                },
                spec: {
                    replicas: 1,
                    selector: { matchLabels: { "app.kubernetes.io/name": "homepage" } },
                    template: {
                        metadata: { labels: { "app.kubernetes.io/name": "homepage" } },
                        spec: {
                            serviceAccountName: sa.metadata.name,
                            automountServiceAccountToken: true,
                            dnsPolicy: "ClusterFirst",
                            enableServiceLinks: true,
                            volumes: [
                                { name: "config", configMap: { name: configMap.metadata.name } },
                            ],
                            containers: [
                                {
                                    name: "homepage",
                                    image: "ghcr.io/gethomepage/homepage:latest",
                                    imagePullPolicy: "IfNotPresent",
                                    ports: [{ name: "http", containerPort: 3000, protocol: "TCP" }],
                                    env: [
                                        {
                                            name: "HOMEPAGE_ALLOWED_HOSTS",
                                            value: "homepage.pipefish-manta.ts.net",
                                        },
                                    ],
                                    volumeMounts: [
                                        { name: "config", mountPath: "/app/config/kubernetes.yaml", subPath: "kubernetes.yaml" },
                                        { name: "config", mountPath: "/app/config/settings.yaml", subPath: "settings.yaml" },
                                        { name: "config", mountPath: "/app/config/services.yaml", subPath: "services.yaml" },
                                        { name: "config", mountPath: "/app/config/widgets.yaml", subPath: "widgets.yaml" },
                                        { name: "config", mountPath: "/app/config/bookmarks.yaml", subPath: "bookmarks.yaml" },
                                        { name: "config", mountPath: "/app/config/custom.css", subPath: "custom.css" },
                                        { name: "config", mountPath: "/app/config/custom.js", subPath: "custom.js" },
                                    ],
                                    resources: {
                                        requests: { cpu: "10m", memory: "64Mi" },
                                        limits: { cpu: "100m", memory: "128Mi" },
                                    },
                                    securityContext: {
                                        allowPrivilegeEscalation: false,
                                        capabilities: { drop: ["ALL"] },
                                    },
                                    readinessProbe: {
                                        httpGet: { path: "/", port: 3000 },
                                        initialDelaySeconds: 10,
                                        periodSeconds: 10,
                                        failureThreshold: 3,
                                    },
                                },
                            ],
                        },
                    },
                },
            },
            { parent: this, dependsOn: [sa, configMap], aliases: [{ parent: pulumi.rootStackResource }] },
        );

        const service = new kubernetes.core.v1.Service(
            "homepage",
            {
                metadata: {
                    name: "homepage",
                    namespace: "default",
                    labels: { "app.kubernetes.io/name": "homepage" },
                },
                spec: {
                    type: "ClusterIP",
                    selector: { "app.kubernetes.io/name": "homepage" },
                    ports: [{ name: "http", port: 3000, targetPort: "http", protocol: "TCP" }],
                },
            },
            { parent: this, aliases: [{ parent: pulumi.rootStackResource }], ignoreChanges: SERVICE_IGNORE_CHANGES },
        );

        makeTailscaleIngress(
            "homepage",
            "homepage",
            service.metadata.name,
            3000,
            "default",
            { parent: this, dependsOn: [service], aliases: [{ parent: pulumi.rootStackResource }] },
        );

        this.registerOutputs({});
    }
}

new HomepageStack("homepage");
