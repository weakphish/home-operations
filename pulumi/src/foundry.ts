import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { FoundryConfig } from "./types";

function createFoundrySecret(
	config: FoundryConfig,
	opts?: pulumi.ComponentResourceOptions,
): k8s.core.v1.Secret {
	return new k8s.core.v1.Secret(
		"foundry-creds",
		{
			metadata: {
				namespace: "default",
			},
			type: "Opaque",
			stringData: {
				"admin-pw": config.adminKey,
				password: config.pw,
				username: config.username,
			},
		},
		opts,
	);
}

function createFoundryPersistentVolume(
	opts?: pulumi.ComponentResourceOptions,
): k8s.core.v1.PersistentVolume {
	return new k8s.core.v1.PersistentVolume(
		"foundry-data",
		{
			metadata: {
				labels: {
					type: "local",
				},
			},
			spec: {
				storageClassName: "manual",
				capacity: {
					storage: "50Gi",
				},
				hostPath: {
					path: "/home/jack/foundrydata",
				},
				persistentVolumeReclaimPolicy: "Retain",
				accessModes: ["ReadWriteOnce"],
				nodeAffinity: {
					required: {
						nodeSelectorTerms: [
							{
								matchExpressions: [
									{
										key: "kubernetes.io/hostname",
										operator: "In",
										values: ["new-bermuda"],
									},
								],
							},
						],
					},
				},
			},
		},
		opts,
	);
}

function createFoundryPersistentVolumeClaim(
	opts?: pulumi.ComponentResourceOptions,
): k8s.core.v1.PersistentVolumeClaim {
	return new k8s.core.v1.PersistentVolumeClaim(
		"foundry-claim",
		{
			metadata: {
				namespace: "default",
			},
			spec: {
				storageClassName: "manual",
				accessModes: ["ReadWriteOnce"],
				resources: {
					requests: {
						storage: "25Gi",
					},
				},
			},
		},
		opts,
	);
}

function createFoundryService(
	opts?: pulumi.ComponentResourceOptions,
): k8s.core.v1.Service {
	return new k8s.core.v1.Service(
		"foundry",
		{
			metadata: {
				namespace: "default",
				labels: {
					"io.kompose.service": "foundry",
				},
			},
			spec: {
				ports: [
					{
						name: "foundry-port",
						port: 30000,
						targetPort: 30000,
					},
				],
			},
		},
		opts,
	);
}

function createFoundryDeployment(
	dependencies: {
		secret: k8s.core.v1.Secret;
		pv: k8s.core.v1.PersistentVolume;
		pvc: k8s.core.v1.PersistentVolumeClaim;
		service: k8s.core.v1.Service;
	},
	opts?: pulumi.ComponentResourceOptions,
): k8s.apps.v1.Deployment {
	return new k8s.apps.v1.Deployment(
		"foundry-deployment",
		{
			metadata: {
				namespace: "default",
				labels: {
					"io.kompose.service": "foundry",
				},
			},
			spec: {
				replicas: 1,
				selector: {
					matchLabels: {
						"io.kompose.service": "foundry",
					},
				},
				strategy: {
					type: "Recreate",
				},
				template: {
					metadata: {
						labels: {
							"io.kompose.service": "foundry"
						}
					},
					spec: {
						volumes: [
							{
								name: dependencies.pv.metadata.name,
								persistentVolumeClaim: {
									claimName: "foundry-claim",
								},
							},
						],
						containers: [
							{
								name: "foundry-container",
								image: "felddy/foundryvtt:13",
								ports: [
									{
										containerPort: 30000,
										protocol: "TCP",
									},
								],
								volumeMounts: [
									{
										mountPath: "/data",
										name: dependencies.pv.metadata.name,
									},
								],
								env: [
									{
										name: "FOUNDRY_ADMIN_KEY",
										valueFrom: {
											secretKeyRef: {
												name: dependencies.secret
													.metadata.name,
												key: "admin-pw",
											},
										},
									},
									{
										name: "FOUNDRY_PASSWORD",
										valueFrom: {
											secretKeyRef: {
												name: dependencies.secret
													.metadata.name,
												key: "password",
											},
										},
									},
									{
										name: "FOUNDRY_USERNAME",
										valueFrom: {
											secretKeyRef: {
												name: dependencies.secret.metadata.name,
												key: "username",
											},
										},
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
			dependsOn: [
				dependencies.secret,
				dependencies.pv,
				dependencies.pvc,
				dependencies.service,
			],
		},
	);
}

export function createFoundryResources(
	config: FoundryConfig,
	opts?: pulumi.ComponentResourceOptions,
) {
	const foundrySecret = createFoundrySecret(config, opts);
	const foundryPv = createFoundryPersistentVolume(opts);
	const foundryPvc = createFoundryPersistentVolumeClaim(opts);
	const foundryService = createFoundryService(opts);
	const foundryDeployment = createFoundryDeployment(
		{
			secret: foundrySecret,
			pv: foundryPv,
			pvc: foundryPvc,
			service: foundryService,
		},
		opts,
	);

	return {
		secret: foundrySecret,
		persistentVolume: foundryPv,
		persistentVolumeClaim: foundryPvc,
		service: foundryService,
		deployment: foundryDeployment,
	};
}
