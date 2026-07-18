import type { BranchInfo } from "../lib/types";
import { TabPills } from "./ui/TabPills";

interface BranchSelectorProps {
  branches: BranchInfo[];
  value: string;
  onChange: (key: string) => void;
  extraTabs?: { key: string; label: string }[];
}

// Selector de sede compartido por Facturación e Informes. `extraTabs` permite
// opciones adicionales como "General" en Informes.
export function BranchSelector({ branches, value, onChange, extraTabs = [] }: BranchSelectorProps) {
  const tabs = [
    ...branches.map((b) => ({ key: b.id, label: b.name })),
    ...extraTabs,
  ];
  if (tabs.length === 0) return null;
  return <TabPills tabs={tabs} active={value} onChange={onChange} size="sm" />;
}
