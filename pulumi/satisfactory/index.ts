import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

interface SatisfactoryConfig {
  maxPlayers?: number;
  puid?: number;
  pgid?: number;
}

const appLabels = { app: "satisfactory" };

function createSatisfactoryPersistentVolume(
  nodeName: string,
  opts?: pulumi.ComponentResourceOptions,
): k8s.core.v1.PersistentVolume {
  return new k8s.core.v1.PersistentVolume(
    "satisfactory-data",
    {
      metadata: {
        name: "satisfactory-data",
        labels: {
          type: "local",
        },
      },
      spec: {
        storageClassName: "manual",
        capacity: {
          storage: "30Gi",
        },
        hostPath: {
          path: "/home/jack/satisfactory",
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
                    values: [nodeName],
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

function createSatisfactoryPersistentVolumeClaim(
  opts?: pulumi.ComponentResourceOptions,
): k8s.core.v1.PersistentVolumeClaim {
  return new k8s.core.v1.PersistentVolumeClaim(
    "satisfactory-claim",
    {
      metadata: {
        name: "satisfactory-claim",
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

function createSatisfactoryService(
  opts?: pulumi.ComponentResourceOptions,
): k8s.core.v1.Service {
  return new k8s.core.v1.Service(
    "satisfactory",
    {
      metadata: {
        namespace: "default",
        labels: appLabels,
        annotations: {
          "tailscale.com/expose": "true",
        },
      },
      spec: {
        type: "NodePort",
        selector: appLabels,
        ports: [
          {
            name: "game-tcp",
            port: 7777,
            targetPort: 7777,
            protocol: "TCP",
          },
          {
            name: "game-udp",
            port: 7777,
            targetPort: 7777,
            protocol: "UDP",
          },
          {
            name: "messaging",
            port: 8888,
            targetPort: 8888,
            protocol: "TCP",
          },
        ],
      },
    },
    opts,
  );
}

function createSatisfactoryDeployment(
  config: SatisfactoryConfig,
  dependencies: {
    pv: k8s.core.v1.PersistentVolume;
    pvc: k8s.core.v1.PersistentVolumeClaim;
    service: k8s.core.v1.Service;
  },
  opts?: pulumi.ComponentResourceOptions,
): k8s.apps.v1.Deployment {
  return new k8s.apps.v1.Deployment(
    "satisfactory-deployment",
    {
      metadata: {
        namespace: "default",
        labels: appLabels,
        annotations: {
          "glance/name": "Satisfactory",
          "glance/icon": "si:satisfactory",
          "glance/id": "satisfactory",
        },
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: appLabels,
        },
        strategy: {
          type: "Recreate",
        },
        template: {
          metadata: {
            labels: appLabels,
          },
          spec: {
            volumes: [
              {
                name: "satisfactory-config",
                persistentVolumeClaim: {
                  claimName: "satisfactory-claim",
                },
              },
            ],
            containers: [
              {
                name: "satisfactory",
                image: "wolveix/satisfactory-server:v1.9.10", // TODO: stack arg-ify
                ports: [
                  {
                    containerPort: 7777,
                    protocol: "TCP",
                  },
                  {
                    containerPort: 7777,
                    protocol: "UDP",
                  },
                  {
                    containerPort: 8888,
                    protocol: "TCP",
                  },
                ],
                volumeMounts: [
                  {
                    mountPath: "/config",
                    name: "satisfactory-config",
                  },
                ],
                env: [
                  {
                    name: "MAXPLAYERS",
                    value: String(config.maxPlayers ?? 4),
                  },
                  {
                    name: "PGID",
                    value: String(config.pgid ?? 1000),
                  },
                  {
                    name: "PUID",
                    value: String(config.puid ?? 1000),
                  },
                  {
                    name: "STEAMBETA",
                    value: "false",
                  },
                ],
                resources: {
                  limits: {
                    memory: "8Gi",
                  },
                  requests: {
                    memory: "4Gi",
                  },
                },
                livenessProbe: {
                  exec: {
                    command: ["/bin/sh", "-c", "/home/steam/healthcheck.sh"],
                  },
                  initialDelaySeconds: 300,
                  periodSeconds: 30,
                  failureThreshold: 4,
                },
              },
            ],
          },
        },
      },
    },
    {
      ...opts,
      dependsOn: [dependencies.pv, dependencies.pvc, dependencies.service],
    },
  );
}

const tailscaleStack = new pulumi.StackReference("tailscale-stack", {
  name: "weakphish/tailscale/homelab",
});

const pulumiConfig = new pulumi.Config();
const satisfactoryConfig =
  pulumiConfig.getObject<SatisfactoryConfig>("satisfactory") ?? {};
const nodeName = pulumiConfig.requireSecret("nodeName");

const satisfactoryPv = nodeName.apply((n) =>
  createSatisfactoryPersistentVolume(n),
);
const satisfactoryPvc = createSatisfactoryPersistentVolumeClaim();
const satisfactoryService = createSatisfactoryService({
  dependsOn: [tailscaleStack],
});
const satisfactoryDeployment = satisfactoryPv.apply((pv) =>
  createSatisfactoryDeployment(
    satisfactoryConfig,
    {
      pv: pv,
      pvc: satisfactoryPvc,
      service: satisfactoryService,
    },
  ),
);

export const serviceName = satisfactoryService.metadata.name;

export {
  satisfactoryPv,
  satisfactoryPvc,
  satisfactoryService,
  satisfactoryDeployment,
};
