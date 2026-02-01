import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as yaml from "yaml";

interface GlanceConfig {
    glanceConfig: Record<string, string>;
}

function createGlanceConfigMap(
    config: GlanceConfig,
    opts?: pulumi.ComponentResourceOptions,
): k8s.core.v1.ConfigMap {
    const yamlConf = yaml.stringify(config.glanceConfig);
    pulumi.log.info(`Got yaml conf: ${yamlConf}`);
    return new k8s.core.v1.ConfigMap(
        "glance-config",
        {
            metadata: {
                namespace: "default",
            },
            data: {
                "glance.yml": yamlConf,
            },
        },
        opts,
    );
}

function createGlanceService(
    opts?: pulumi.ComponentResourceOptions,
): k8s.core.v1.Service {
    return new k8s.core.v1.Service(
        "glance",
        {
            metadata: {
                namespace: "default",
                labels: {
                    "io.kompose.service": "glance",
                },
            },
            spec: {
                selector: {
                    "io.kompose.service": "glance",
                },
                ports: [
                    {
                        name: "glance-port",
                        port: 8080,
                        targetPort: 8080,
                    },
                ],
            },
        },
        opts,
    );
}

function createGlanceIngress(
    service: k8s.core.v1.Service,
    opts?: pulumi.ComponentResourceOptions,
): k8s.networking.v1.Ingress {
    return new k8s.networking.v1.Ingress(
        "glance-ingress",
        {
            metadata: {
                namespace: "default",
                annotations: {
                    "glance/id": "glance",
                },
            },
            spec: {
                ingressClassName: "tailscale",
                defaultBackend: {
                    service: {
                        name: service.metadata.name,
                        port: {
                            number: 8080,
                        },
                    },
                },
                tls: [
                    {
                        hosts: ["glance"],
                    },
                ],
            },
        },
        { ...opts, dependsOn: [service, ...(opts?.dependsOn as pulumi.Resource[] ?? [])] },
    );
}

function createGlanceDeployment(
    dependencies: {
        configMap: k8s.core.v1.ConfigMap;
        service: k8s.core.v1.Service;
    },
    opts?: pulumi.ComponentResourceOptions,
): k8s.apps.v1.Deployment {
    return new k8s.apps.v1.Deployment(
        "glance-deployment",
        {
            metadata: {
                namespace: "default",
                labels: {
                    "io.kompose.service": "glance",
                },
                annotations: {
                    "glance/name": "Glance",
                    "glance/icon": "di:glance",
                    "glance/id": "glance",
                },
            },
            spec: {
                replicas: 1,
                selector: {
                    matchLabels: {
                        "io.kompose.service": "glance",
                    },
                },
                template: {
                    metadata: {
                        labels: {
                            "io.kompose.service": "glance",
                        },
                    },
                    spec: {
                        volumes: [
                            {
                                name: "glance-config",
                                configMap: {
                                    name: dependencies.configMap.metadata.name,
                                },
                            },
                        ],
                        containers: [
                            {
                                name: "glance-container",
                                image: "glanceapp/glance",
                                ports: [
                                    {
                                        containerPort: 8080,
                                        protocol: "TCP",
                                    },
                                ],
                                volumeMounts: [
                                    {
                                        mountPath: "/app/config/glance.yml",
                                        name: "glance-config",
                                        subPath: "glance.yml",
                                    },
                                ],
                            },
                        ],
                    },
                },
            },
        },
        {
            ...opts,
            dependsOn: [dependencies.configMap, dependencies.service],
        },
    );
}

function setupGlanceK8sChart() {
    return new k8s.helm.v3.Chart("glance-k8s", {
        chart: "oci://ghcr.io/lukasdietrich/glance-k8s/chart/glance-k8s",
        namespace: "default", // TODO: might need it's own
        version: "v0.1.3", // TODO: make configurable
    });
}

const tailscaleStack = new pulumi.StackReference("tailscale-stack", {
    name: "weakphish/tailscale/homelab",
});

const config = new pulumi.Config();
const glanceConfig = config.requireObject<GlanceConfig>("glanceConfig");
pulumi.log.info(`Got glanceConfig: ${glanceConfig}`);

const glanceConfigMap = createGlanceConfigMap(glanceConfig);
const glanceService = createGlanceService();

createGlanceIngress(glanceService, { dependsOn: [tailscaleStack] });
createGlanceDeployment({
    configMap: glanceConfigMap,
    service: glanceService,
});
setupGlanceK8sChart();
