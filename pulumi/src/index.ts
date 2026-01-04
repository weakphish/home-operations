import * as pulumi from "@pulumi/pulumi";
import * as cf from "./cloudflare-cloud";
import * as cfd from "./cloudflared";
import * as foundry from "./foundry";
import { InfrastructureConfig } from "./types";

export = async () => {
    const config = new pulumi.Config();
    const data = config.requireObject<InfrastructureConfig>("infrastructure");

    const tunnelToken = await cf.configureCloudflare(data);
    cfd.createCloudflaredDeployment(data, tunnelToken);

    foundry.createFoundryResources(data.foundry);
};
