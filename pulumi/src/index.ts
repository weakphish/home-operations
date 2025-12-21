import * as pulumi from "@pulumi/pulumi";
import * as cf from "./cloudflare";
import * as resources from "./k8s_resources";
import { InfrastructureConfig } from "./types";

const config = new pulumi.Config();
const data = config.requireObject<InfrastructureConfig>("infrastructure");

cf.configureCloudflare(data);

resources.configureCloudflaredDeployment();
resources.configureFoundry();
