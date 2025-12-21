import * as k8s from "@pulumi/kubernetes";

/**
 * Configure a Foundry deployment and service on the K8s cluster
 */
export async function configureFoundry() {
    const appLabels = { app: "foundry" };
    const foundryWeb = new k8s.apps.v1.StatefulSet("foundryWeb", {
        metadata: {
            name: "foundry-web",
        },
        spec: {
            replicas: 1,
            selector: {
                matchLabels: appLabels,
            },
            serviceName: "foundry-svc",
            template: {
                metadata: {
                    labels: appLabels,
                },
                spec: {
                    containers: [
                        {
                            env: [
                                {
                                    name: "FOUNDRY_ADMIN_KEY",
                                    valueFrom: {
                                        secretKeyRef: {
                                            key: "admin",
                                            name: "foundry-creds",
                                        },
                                    },
                                },
                                {
                                    name: "FOUNDRY_PASSWORD",
                                    valueFrom: {
                                        secretKeyRef: {
                                            key: "password",
                                            name: "foundry-creds",
                                        },
                                    },
                                },
                                {
                                    name: "FOUNDRY_USERNAME",
                                    valueFrom: {
                                        secretKeyRef: {
                                            key: "username",
                                            name: "foundry-creds",
                                        },
                                    },
                                },
                            ],
                            image: "felddy/foundryvtt:13",
                            name: "foundry",
                            ports: [
                                {
                                    containerPort: 30000,
                                    name: "foundry-web",
                                },
                            ],
                            volumeMounts: [
                                {
                                    mountPath: "/data",
                                    name: "data",
                                },
                            ],
                        },
                    ],
                },
            },
            volumeClaimTemplates: [
                {
                    metadata: {
                        name: "data",
                    },
                    spec: {
                        accessModes: ["ReadWriteOnce"],
                        resources: {
                            requests: {
                                storage: "10Gi",
                            },
                        },
                    },
                },
            ],
        },
    });
    const foundrySvc = new k8s.core.v1.Service("foundrySvc", {
        metadata: {
            name: "foundry-svc",
            namespace: "default",
        },
        spec: {
            ports: [
                {
                    port: 30000,
                    targetPort: 30000,
                },
            ],
            selector: appLabels,
            type: k8s.core.v1.ServiceSpecType.ClusterIP,
        },
    });
}

async function configureCloudflaredDeployment() {
    const cloudflaredDeployment = new k8s.apps.v1.Deployment(
        "cloudflaredDeployment",
        {
            metadata: {
                name: "cloudflared-deployment",
                namespace: "default",
            },
            spec: {
                replicas: 2,
                selector: {
                    matchLabels: {
                        pod: "cloudflared",
                    },
                },
                template: {
                    metadata: {
                        labels: {
                            pod: "cloudflared",
                        },
                    },
                    spec: {
                        containers: [
                            {
                                command: [
                                    "cloudflared",
                                    "tunnel",
                                    "--no-autoupdate",
                                    "--loglevel",
                                    "info",
                                    "--metrics",
                                    "0.0.0.0:2000",
                                    "run",
                                ],
                                // TODO: make pulumi secret
                                env: [
                                    {
                                        name: "TUNNEL_TOKEN",
                                        valueFrom: {
                                            secretKeyRef: {
                                                key: "token",
                                                name: "tunnel-token",
                                            },
                                        },
                                    },
                                ],
                                image: "cloudflare/cloudflared:latest",
                                livenessProbe: {
                                    failureThreshold: 1,
                                    httpGet: {
                                        path: "/ready",
                                        port: 2000,
                                    },
                                    initialDelaySeconds: 10,
                                    periodSeconds: 10,
                                },
                                name: "cloudflared",
                            },
                        ],
                        securityContext: {
                            sysctls: [
                                {
                                    name: "net.ipv4.ping_group_range",
                                    value: "65532 65532",
                                },
                            ],
                        },
                    },
                },
            },
        },
    );
}
