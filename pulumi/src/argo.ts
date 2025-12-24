import * as pulumi from "@pulumi/pulumi";
import * as kubernetes from "@pulumi/kubernetes";

export async function configureArgoCD() {
    // Create a K8s namespace.
    const devNamespace = new kubernetes.core.v1.Namespace("argocd-namespace", {
        metadata: {
            name: "argocd",
        },
    });

    // Deploy the K8s nginx-ingress Helm chart into the created namespace.
    new kubernetes.helm.v3.Chart("argo-cd", {
        chart: "argo-cd",
        namespace: devNamespace.metadata.name,
        fetchOpts: {
            repo: "https://argoproj.github.io/argo-helm",
        },
    });
}
