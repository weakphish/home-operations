import * as pulumi from "@pulumi/pulumi";
import * as cf from "./cloudflare-cloud";
import * as cfd from "./cloudflared";
import * as foundry from "./foundry";
import * as glance from "./glance";
import * as tailscale from "./tailscale";
import { InfrastructureConfig } from "./types";

export = async () => {
    const config = new pulumi.Config();
    const data = config.requireObject<InfrastructureConfig>("infrastructure");

    // CREATE FOUNDRY FIRST to get service reference
    const foundryResources = foundry.createFoundryResources(data.foundry);

    // CREATE GLANCE (independent, Tailscale access only)
    const glanceResources = glance.createGlanceResources(data.glance);

    // THEN create Cloudflare with service reference
    const tunnelToken = await cf.configureCloudflare(data, foundryResources.service);
    cfd.createCloudflaredDeployment(data, tunnelToken);

    // CREATE TAILSCALE OPERATOR
    tailscale.createTailscaleOperator(data.tailscale);
};
