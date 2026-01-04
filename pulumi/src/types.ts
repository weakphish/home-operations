export interface CloudflareConfig {
    accountId: string;
    zoneId: string;
    tunnelToken: string;
    foundryEmails: Array<string>;
}

export interface FoundryConfig {
    adminKey: string;
    username: string;
    pw: string;
}

export interface InfrastructureConfig {
    domain: string;
    cloudflare: CloudflareConfig;
    foundry: FoundryConfig;
}
