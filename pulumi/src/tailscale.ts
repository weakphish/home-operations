import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { TailscaleConfig } from "./types";

export function createTailscaleOperator(
	config: TailscaleConfig,
	opts?: pulumi.ComponentResourceOptions,
) {
	const namespace = new k8s.core.v1.Namespace(
		"tailscale-namespace",
		{
			metadata: {
				name: "tailscale",
			},
		},
		opts,
	);

	const operator = new k8s.helm.v3.Chart(
		"tailscale-operator",
		{
			chart: "tailscale-operator",
			namespace: namespace.metadata.name,
			fetchOpts: {
				repo: "https://pkgs.tailscale.com/helmcharts",
			},
			values: {
				oauth: {
					clientId: config.clientId,
					clientSecret: config.clientSecret,
				},
			},
		},
		{ ...opts, dependsOn: [namespace] },
	);

	return { namespace, operator };
}
