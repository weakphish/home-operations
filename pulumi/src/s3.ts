import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// TODO: Foundry s3 backend?
export async function configureS3Bucket() {
    // Create an S3 Bucket for storage
    const bucket = new aws.s3.Bucket("foundry-assets");
    const bucketCORSRule = new aws.s3.BucketCorsConfiguration(
        "foundry-asset-cors-config",
        {
            bucket: bucket.id,
            corsRules: [
                // found at https://foundryvtt.com/article/aws-s3/
                {
                    allowedOrigins: ["*"],
                    allowedHeaders: ["*"],
                    allowedMethods: ["GET", "POST", "HEAD"],
                    exposeHeaders: [],
                    maxAgeSeconds: 3000,
                },
            ],
        },
    );
    const bucketPublicAccessBlock = new aws.s3.BucketPublicAccessBlock(
        "bucketPublicAccessBlock",
        {
            bucket: bucket.id,
            blockPublicAcls: true,
            blockPublicPolicy: true,
            ignorePublicAcls: true,
            restrictPublicBuckets: false,
        },
    );
    // foundry requires read-only public access which isn't ideal but it's read only so
    const bucketPolicy = new aws.s3.BucketPolicy("foundry-assets-policy", {
        bucket: bucket.id,
        policy: {
            Version: "2012-10-17",
            Statement: [
                {
                    Sid: "PublicReadGetObject",
                    Action: "s3:GetObject",
                    Effect: "Allow",
                    Resource: pulumi.interpolate`${bucket.arn}/*`,
                    Principal: "*",
                },
            ],
        },
    });

    // Create role for Foundry to access S3 bucket
    const foundryEC2Role = new aws.iam.Role("foundry-s3-role", {
        name: "foundry-s3-role",
        assumeRolePolicy: {
            Version: "2012-10-17",
            Statement: [
                {
                    Action: "sts:AssumeRole",
                    Effect: "Allow",
                    Sid: "",
                    Principal: {
                        Service: "ec2.amazonaws.com",
                    },
                },
            ],
        },
    });

    // From pt. 6 of the guide
    const foundryRolePolicy = new aws.iam.Policy("foundry-s3-access-policy", {
        name: "foundry-s3-access-policy",
        policy: {
            Version: "2012-10-17",
            Statement: [
                {
                    Sid: "VisualEditor0",
                    Effect: "Allow",
                    Action: [
                        "s3:PutObject",
                        "s3:GetObject",
                        "s3:ListBucket",
                        "s3:DeleteObject",
                        "s3:PutObjectAcl",
                    ],
                    Resource: [pulumi.interpolate`${bucket.arn}/*`, bucket.arn],
                },
                {
                    Sid: "VisualEditor1",
                    Effect: "Allow",
                    Action: "s3:ListAllMyBuckets",
                    Resource: "*",
                },
            ],
        },
    });

    const s3RoleAttachment = new aws.iam.RolePolicyAttachment(
        "foundryS3RolePolicyAttachment",
        {
            role: foundryEC2Role.name,
            policyArn: foundryRolePolicy.arn,
        },
    );
}
