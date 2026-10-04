import {
  allModuleIds,
  moduleKind,
  moduleLabel,
  type ModuleId,
  type ModuleStatus,
} from "@bml/contracts";
import readinessSeed from "./readiness.seed.json";

export type UiModule = {
  moduleId: ModuleId;
  label: string;
  kind: string;
  status: ModuleStatus;
};

type SeedFile = {
  modules: Record<string, ModuleStatus>;
};

const seed = readinessSeed as SeedFile;

export function getModules(): UiModule[] {
  return allModuleIds().map((moduleId) => ({
    moduleId,
    label: moduleLabel(moduleId),
    kind: moduleKind(moduleId),
    // Missing benchmark metadata must not hide a module from local experiments.
    // Public completeness still reports the missing entry separately.
    status: seed.modules[moduleId] ?? "experimental",
  }));
}

export function publicCompletenessFromSeed(): {
  complete: boolean;
  locked: string[];
  experimental: string[];
  on: string[];
} {
  const modules = getModules();
  const locked = modules.filter((m) => m.status === "locked").map((m) => m.moduleId);
  const experimental = modules.filter((m) => m.status === "experimental").map((m) => m.moduleId);
  const on = modules.filter((m) => m.status === "on").map((m) => m.moduleId);
  return { complete: locked.length === 0 && experimental.length === 0, locked, experimental, on };
}
