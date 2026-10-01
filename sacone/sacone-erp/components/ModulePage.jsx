'use client';

import { ERP_MODULES, findSectionByModuleId } from '../lib/navigation';
import PlaceholderModule from './PlaceholderModule';

export default function ModulePage({ moduleId }) {
  const module = ERP_MODULES.find((m) => m.id === moduleId);
  const section = findSectionByModuleId(moduleId);

  if (!module) return null;

  if (!module.placeholder) {
    return null;
  }

  return (
    <PlaceholderModule
      module={module}
      sectionLabel={section?.label || module.section}
    />
  );
}
