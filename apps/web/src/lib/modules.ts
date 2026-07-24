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
    status: seed.modules[moduleId] ?? "locked",
  }));
}

export function publicCompletenessFromSeed(): {
  complete: boolean;
  locked: string[];
  on: string[];
} {
  const modules = getModules();
  const locked = modules.filter((m) => m.status === "locked").map((m) => m.moduleId);
  const on = modules.filter((m) => m.status === "on").map((m) => m.moduleId);
  return { complete: locked.length === 0, locked, on };
}
