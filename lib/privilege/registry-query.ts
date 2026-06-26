import { prisma } from '@/lib/prisma';
import type { TargetLevel } from './resolver';

export interface RegistryTargetRow {
  level: string;
  targetId: string;
  name: string;
}

/**
 * Returns registry targets for a single privilege level.
 */
export async function listRegistryTargets(level: TargetLevel): Promise<RegistryTargetRow[]> {
  switch (level) {
    case 'MENU_ITEM': {
      const rows = await prisma.menuItem.findMany({ orderBy: { sortOrder: 'asc' } });
      return rows.map((r) => ({ level, targetId: r.code, name: r.name }));
    }
    case 'MODULE': {
      const rows = await prisma.module.findMany({ orderBy: { sortOrder: 'asc' } });
      return rows.map((r) => ({ level, targetId: r.code, name: r.name }));
    }
    case 'FORM': {
      const rows = await prisma.form.findMany({ include: { module: true } });
      return rows.map((r) => ({ level, targetId: r.code, name: `${r.module.code} / ${r.name}` }));
    }
    case 'TAB': {
      const rows = await prisma.tab.findMany({ include: { form: true } });
      return rows.map((r) => ({ level, targetId: r.code, name: `${r.form.code} / ${r.name}` }));
    }
    case 'SECTION': {
      const rows = await prisma.section.findMany({ include: { form: true } });
      return rows.map((r) => ({ level, targetId: r.code, name: `${r.form?.code ?? ''} / ${r.name}` }));
    }
    case 'FIELD': {
      const rows = await prisma.field.findMany({ include: { section: { include: { form: true } } } });
      return rows.map((r) => ({ level, targetId: r.code, name: r.name }));
    }
    case 'BUTTON': {
      const rows = await prisma.button.findMany({ include: { form: true } });
      return rows.map((r) => ({ level, targetId: r.code, name: `${r.form.code} / ${r.name}` }));
    }
    case 'LIST_COLUMN': {
      const rows = await prisma.listColumnDef.findMany({ include: { module: true } });
      return rows.map((r) => ({ level, targetId: r.code, name: `${r.module.code} / ${r.name}` }));
    }
    case 'LIST_FILTER': {
      const rows = await prisma.listFilterDef.findMany({ include: { module: true } });
      return rows.map((r) => ({ level, targetId: r.code, name: `${r.module.code} / ${r.name}` }));
    }
    case 'BULK_ACTION': {
      const rows = await prisma.bulkActionDef.findMany({ include: { module: true } });
      return rows.map((r) => ({ level, targetId: r.code, name: `${r.module.code} / ${r.name}` }));
    }
    case 'ACTION': {
      const rows = await prisma.actionDef.findMany({ include: { module: true } });
      return rows.map((r) => ({ level, targetId: r.code, name: `${r.module.code} / ${r.name}` }));
    }
    case 'STATUS_TRANSITION': {
      const rows = await prisma.statusTransitionDef.findMany({ include: { module: true } });
      return rows.map((r) => ({ level, targetId: r.code, name: `${r.module.code} / ${r.name}` }));
    }
    case 'RECORD_SCOPE': {
      const rows = await prisma.recordScopeDef.findMany({ include: { module: true } });
      return rows.map((r) => ({
        level,
        targetId: r.module.code,
        name: `${r.module.code} / ${r.name}`,
      }));
    }
    case 'REPORT': {
      const rows = await prisma.reportDef.findMany();
      return rows.map((r) => ({ level, targetId: r.code, name: r.name }));
    }
    case 'DASHBOARD_WIDGET': {
      const rows = await prisma.dashboardWidgetDef.findMany();
      return rows.map((r) => ({ level, targetId: r.code, name: r.name }));
    }
    default:
      return [];
  }
}

/**
 * Returns per-level target counts for the registry inspector.
 */
export async function registryLevelCounts(): Promise<Array<{ level: string; count: number }>> {
  const levels: TargetLevel[] = [
    'MENU_ITEM', 'MODULE', 'FORM', 'TAB', 'SECTION', 'FIELD', 'BUTTON',
    'LIST_COLUMN', 'LIST_FILTER', 'BULK_ACTION', 'ACTION', 'STATUS_TRANSITION',
    'RECORD_SCOPE', 'REPORT', 'DASHBOARD_WIDGET',
  ];
  const counts = await Promise.all(
    levels.map(async (level) => ({ level, count: (await listRegistryTargets(level)).length })),
  );
  return counts;
}
