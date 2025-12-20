import * as cloudflare from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

interface CloudflareConfig {
    accountId: string;
    zoneId: string;
}

interface InfrastructureConfig {
    domain: string;
    cloudflare: CloudflareConfig;
}
const config = new pulumi.Config();

// // Create an S3 Bucket for storage
// const bucket = new aws.s3.Bucket("foundry-assets");
// const bucketCORSRule = new aws.s3.BucketCorsConfiguration(
//     "foundry-asset-cors-config",
//     {
//         bucket: bucket.id,
//         corsRules: [
//             // found at https://foundryvtt.com/article/aws-s3/
//             {
//                 allowedOrigins: ["*"],
//                 allowedHeaders: ["*"],
//                 allowedMethods: ["GET", "POST", "HEAD"],
//                 exposeHeaders: [],
//                 maxAgeSeconds: 3000,
//             },
//         ],
//     },
// );
// const bucketPublicAccessBlock = new aws.s3.BucketPublicAccessBlock(
//     "bucketPublicAccessBlock",
//     {
//         bucket: bucket.id,
//         blockPublicAcls: true,
//         blockPublicPolicy: true,
//         ignorePublicAcls: true,
//         restrictPublicBuckets: false,
//     },
// );
// // foundry requires read-only public access which isn't ideal but it's read only so
// const bucketPolicy = new aws.s3.BucketPolicy("foundry-assets-policy", {
//     bucket: bucket.id,
//     policy: {
//         Version: "2012-10-17",
//         Statement: [
//             {
//                 Sid: "PublicReadGetObject",
//                 Action: "s3:GetObject",
//                 Effect: "Allow",
//                 Resource: pulumi.interpolate`${bucket.arn}/*`,
//                 Principal: "*",
//             },
//         ],
//     },
// });

// // Create role for Foundry to access S3 bucket
// const foundryEC2Role = new aws.iam.Role("foundry-s3-role", {
//     name: "foundry-s3-role",
//     assumeRolePolicy: {
//         Version: "2012-10-17",
//         Statement: [
//             {
//                 Action: "sts:AssumeRole",
//                 Effect: "Allow",
//                 Sid: "",
//                 Principal: {
//                     Service: "ec2.amazonaws.com",
//                 },
//             },
//         ],
//     },
// });

// // From pt. 6 of the guide
// const foundryRolePolicy = new aws.iam.Policy("foundry-s3-access-policy", {
//     name: "foundry-s3-access-policy",
//     policy: {
//         Version: "2012-10-17",
//         Statement: [
//             {
//                 Sid: "VisualEditor0",
//                 Effect: "Allow",
//                 Action: [
//                     "s3:PutObject",
//                     "s3:GetObject",
//                     "s3:ListBucket",
//                     "s3:DeleteObject",
//                     "s3:PutObjectAcl",
//                 ],
//                 Resource: [pulumi.interpolate`${bucket.arn}/*`, bucket.arn],
//             },
//             {
//                 Sid: "VisualEditor1",
//                 Effect: "Allow",
//                 Action: "s3:ListAllMyBuckets",
//                 Resource: "*",
//             },
//         ],
//     },
// });

// const s3RoleAttachment = new aws.iam.RolePolicyAttachment(
//     "foundryS3RolePolicyAttachment",
//     {
//         role: foundryEC2Role.name,
//         policyArn: foundryRolePolicy.arn,
//     },
// );

async function configureFoundry() {
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

async function configureCloudflare() {
    // Configurable settings
    // TODO: stack args
    const data = config.requireObject<InfrastructureConfig>("infrastructure");
    const cloudflareAccountId = data.cloudflare.accountId;
    const zoneId = data.cloudflare.zoneId;
    const domain = data.domain;

    const tunnel = new cloudflare.ZeroTrustTunnelCloudflared("foundry_tunnel", {
        accountId: cloudflareAccountId,
        name: "foundry-tunnel",
        configSrc: "cloudflare",
    });

    // const zeroTrustAccessApplicationResource =
    //     new cloudflare.ZeroTrustAccessApplication("foundry-zero-trust-app", {
    //         accountId: cloudflareAccountId,
    //         domain: domain,
    //     });

    const dnsRecord = new cloudflare.DnsRecord("dns-record", {
        name: "foundry",
        ttl: 1,
        type: "CNAME",
        zoneId: zoneId,
        proxied: true,
        content: "a361db38-afad-4c5a-958e-509eecaec136.cfargotunnel.com", // TODO: extract
    });

    const tunnelConfig = new cloudflare.ZeroTrustTunnelCloudflaredConfig(
        "zeroTrustTunnelCloudflaredConfigResource",
        {
            accountId: tunnel.accountId,
            tunnelId: tunnel.id,
            config: {
                ingresses: [
                    {
                        service: "http://foundry",
                        hostname: pulumi.interpolate`foundry.${domain}`,
                    },
                    {
                        service: "http_status:404",
                    },
                ],
            },
            source: "cloudflare",
        },
    );
}

export = async () => {
    configureCloudflare();
};
