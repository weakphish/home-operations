import * as pulumi from "@pulumi/pulumi";
import * as cf from "./cloudflare";
import { InfrastructureConfig } from "./types";

const config = new pulumi.Config();
const data = config.requireObject<InfrastructureConfig>("infrastructure");

cf.configureCloudflare(data);
