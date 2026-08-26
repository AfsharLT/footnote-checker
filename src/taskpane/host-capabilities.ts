/* global Office */

export const HOST_REQUIREMENT_SETS = [
  { key: "wordApi15", name: "WordApi", version: "1.5", required: true },
  { key: "wordApiDesktop13", name: "WordApiDesktop", version: "1.3", required: false },
  { key: "wordApiDesktop14", name: "WordApiDesktop", version: "1.4", required: false },
  { key: "sharedRuntime11", name: "SharedRuntime", version: "1.1", required: false },
] as const;

export type HostRequirementKey = (typeof HOST_REQUIREMENT_SETS)[number]["key"];

export interface HostCapabilityEnvironment {
  host?: unknown;
  platform?: unknown;
  version?: unknown;
  isSetSupported(name: string, version: string): boolean;
}

export interface HostCapabilities {
  host: string;
  platform: string;
  officeVersion?: string;
  requirementSets: Record<HostRequirementKey, boolean>;
  missingRequiredCapabilities: string[];
  supported: boolean;
}

function diagnosticValue(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

export function detectHostCapabilities(environment: HostCapabilityEnvironment): HostCapabilities {
  const requirementSets = {} as Record<HostRequirementKey, boolean>;
  const missingRequiredCapabilities: string[] = [];
  for (const requirement of HOST_REQUIREMENT_SETS) {
    let supported = false;
    try {
      supported = environment.isSetSupported(requirement.name, requirement.version);
    } catch {
      supported = false;
    }
    requirementSets[requirement.key] = supported;
    if (requirement.required && !supported) {
      missingRequiredCapabilities.push(`${requirement.name} ${requirement.version}`);
    }
  }
  const host = diagnosticValue(environment.host, "Unbekannt");
  const platform = diagnosticValue(environment.platform, "Unbekannt");
  const officeVersion = diagnosticValue(environment.version, "");
  return {
    host,
    platform,
    ...(officeVersion ? { officeVersion } : {}),
    requirementSets,
    missingRequiredCapabilities,
    supported: missingRequiredCapabilities.length === 0,
  };
}

export function getOfficeHostCapabilities(): HostCapabilities {
  try {
    const diagnostics = Office.context.diagnostics;
    return detectHostCapabilities({
      host: Office.context.host ?? diagnostics?.host,
      platform: Office.context.platform ?? diagnostics?.platform,
      version: diagnostics?.version,
      isSetSupported: (name, version) => Office.context.requirements.isSetSupported(name, version),
    });
  } catch {
    return detectHostCapabilities({ isSetSupported: () => false });
  }
}

export class UnsupportedHostCapabilityError extends Error {
  readonly capabilities: HostCapabilities;

  constructor(capabilities: HostCapabilities) {
    super("Diese Word-Version unterstützt eine benötigte Funktion noch nicht.");
    this.name = "UnsupportedHostCapabilityError";
    this.capabilities = capabilities;
  }
}

export function unsupportedCapabilityTechnicalDetails(capabilities: HostCapabilities): string {
  return [
    `Host: ${capabilities.host}`,
    `Plattform: ${capabilities.platform}`,
    `Office-Version: ${capabilities.officeVersion ?? "nicht verfügbar"}`,
    `Fehlende Capability: ${capabilities.missingRequiredCapabilities.join(", ") || "keine"}`,
    `Requirement Sets: ${JSON.stringify(capabilities.requirementSets)}`,
  ].join("\n");
}
