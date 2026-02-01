import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

// Get the tunnel token secret name from the cf-tunnel stack
const cfTunnelStack = new pulumi.StackReference("cf-tunnel-stack", {
	name: "weakphish/cf-tunnel/homelab",
});
const tunnelTokenSecretName = cfTunnelStack.getOutput("tunnelTokenSecretName");

const deployment = new k8s.apps.v1.Deployment("cloudflared-deployment", {
	metadata: {
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
				securityContext: {
					sysctls: [
						{
							name: "net.ipv4.ping_group_range",
							value: "65532 65532",
						},
					],
				},
				containers: [
					{
						image: "cloudflare/cloudflared:latest",
						name: "cloudflared",
						env: [
							{
								name: "TUNNEL_TOKEN",
								valueFrom: {
									secretKeyRef: {
										name: tunnelTokenSecretName,
										key: "token",
									},
								},
							},
						],
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
						livenessProbe: {
							httpGet: {
								path: "/ready",
								port: 2000,
							},
							failureThreshold: 1,
							initialDelaySeconds: 10,
							periodSeconds: 10,
						},
					},
				],
			},
		},
	},
});

export { deployment };
