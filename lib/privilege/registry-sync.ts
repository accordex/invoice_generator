import { prisma } from '@/lib/prisma';
import type { ProductManifest, SectionDef } from './types';
import { invoiceManifest } from './manifest';

/** Summary returned after syncing the manifest into the registry tables. */
export interface RegistrySyncResult {
  menuItems: number;
  modules: number;
  forms: number;
  tabs: number;
  sections: number;
  fields: number;
  buttons: number;
  actions: number;
  bulkActions: number;
  transitions: number;
  scopes: number;
  listColumns: number;
  listFilters: number;
  reports: number;
  dashboardWidgets: number;
}

/**
 * Seeds or updates the privilege registry from a product manifest.
 * Uses upsert on unique code constraints; safe to run repeatedly (idempotent).
 *
 * @param manifest - Product manifest to sync (defaults to invoice manifest).
 * @returns Counts of synced entities per registry table.
 */
export async function syncManifestToRegistry(
  manifest: ProductManifest = invoiceManifest,
): Promise<RegistrySyncResult> {
  const result: RegistrySyncResult = {
    menuItems: 0,
    modules: 0,
    forms: 0,
    tabs: 0,
    sections: 0,
    fields: 0,
    buttons: 0,
    actions: 0,
    bulkActions: 0,
    transitions: 0,
    scopes: 0,
    listColumns: 0,
    listFilters: 0,
    reports: 0,
    dashboardWidgets: 0,
  };

  const menuIdByCode = new Map<string, string>();

  const roots = manifest.menuItems.filter((item) => !item.parentCode);
  const children = manifest.menuItems.filter((item) => item.parentCode);

  for (const item of roots) {
    const row = await prisma.menuItem.upsert({
      where: { code: item.code },
      create: {
        code: item.code,
        name: item.name,
        icon: item.icon,
        route: item.route,
        sortOrder: item.sortOrder ?? 0,
      },
      update: {
        name: item.name,
        icon: item.icon,
        route: item.route,
        sortOrder: item.sortOrder ?? 0,
      },
    });
    menuIdByCode.set(item.code, row.id);
    result.menuItems += 1;
  }

  let pending = [...children];
  while (pending.length > 0) {
    const nextRound: typeof pending = [];
    for (const item of pending) {
      const parentId = item.parentCode ? menuIdByCode.get(item.parentCode) : undefined;
      if (item.parentCode && !parentId) {
        nextRound.push(item);
        continue;
      }
      const row = await prisma.menuItem.upsert({
        where: { code: item.code },
        create: {
          code: item.code,
          name: item.name,
          icon: item.icon,
          route: item.route,
          parentId,
          sortOrder: item.sortOrder ?? 0,
        },
        update: {
          name: item.name,
          icon: item.icon,
          route: item.route,
          parentId,
          sortOrder: item.sortOrder ?? 0,
        },
      });
      menuIdByCode.set(item.code, row.id);
      result.menuItems += 1;
    }
    if (nextRound.length === pending.length) break;
    pending = nextRound;
  }

  for (const mod of manifest.modules) {
    const moduleRow = await prisma.module.upsert({
      where: { code: mod.code },
      create: {
        code: mod.code,
        name: mod.name,
        icon: mod.icon,
        sortOrder: mod.sortOrder ?? 0,
      },
      update: {
        name: mod.name,
        icon: mod.icon,
        sortOrder: mod.sortOrder ?? 0,
      },
    });
    result.modules += 1;

    for (const action of mod.actions) {
      await prisma.actionDef.upsert({
        where: { moduleId_code: { moduleId: moduleRow.id, code: action.code } },
        create: {
          moduleId: moduleRow.id,
          code: action.code,
          name: action.name,
          isHighRisk: action.isHighRisk ?? false,
        },
        update: {
          name: action.name,
          isHighRisk: action.isHighRisk ?? false,
        },
      });
      result.actions += 1;
    }

    for (const bulk of mod.bulkActions) {
      await prisma.bulkActionDef.upsert({
        where: { moduleId_code: { moduleId: moduleRow.id, code: bulk.code } },
        create: {
          moduleId: moduleRow.id,
          code: bulk.code,
          name: bulk.name,
          isHighRisk: bulk.isHighRisk ?? true,
        },
        update: {
          name: bulk.name,
          isHighRisk: bulk.isHighRisk ?? true,
        },
      });
      result.bulkActions += 1;
    }

    for (const transition of mod.transitions) {
      await prisma.statusTransitionDef.upsert({
        where: { moduleId_code: { moduleId: moduleRow.id, code: transition.code } },
        create: {
          moduleId: moduleRow.id,
          code: transition.code,
          name: transition.name,
          fromStatus: transition.fromStatus,
          toStatus: transition.toStatus,
        },
        update: {
          name: transition.name,
          fromStatus: transition.fromStatus,
          toStatus: transition.toStatus,
        },
      });
      result.transitions += 1;
    }

    for (const scope of mod.scopes) {
      const existing = await prisma.recordScopeDef.findFirst({
        where: { moduleId: moduleRow.id, code: scope.code ?? 'DEFAULT' },
      });
      if (existing) {
        await prisma.recordScopeDef.update({
          where: { id: existing.id },
          data: {
            name: scope.name,
            ownerField: scope.ownerField,
            teamField: scope.teamField,
            branchField: scope.branchField,
            departmentField: scope.departmentField,
          },
        });
      } else {
        await prisma.recordScopeDef.create({
          data: {
            moduleId: moduleRow.id,
            code: scope.code ?? 'DEFAULT',
            name: scope.name,
            ownerField: scope.ownerField,
            teamField: scope.teamField,
            branchField: scope.branchField,
            departmentField: scope.departmentField,
          },
        });
      }
      result.scopes += 1;
    }

    for (const column of mod.listColumns) {
      await prisma.listColumnDef.upsert({
        where: { moduleId_code: { moduleId: moduleRow.id, code: column.code } },
        create: {
          moduleId: moduleRow.id,
          code: column.code,
          name: column.name,
          fieldCode: column.fieldCode,
          defaultMaskPattern: column.defaultMaskPattern,
          sortOrder: column.sortOrder ?? 0,
        },
        update: {
          name: column.name,
          fieldCode: column.fieldCode,
          defaultMaskPattern: column.defaultMaskPattern,
          sortOrder: column.sortOrder ?? 0,
        },
      });
      result.listColumns += 1;
    }

    for (const filter of mod.listFilters) {
      await prisma.listFilterDef.upsert({
        where: { moduleId_code: { moduleId: moduleRow.id, code: filter.code } },
        create: {
          moduleId: moduleRow.id,
          code: filter.code,
          name: filter.name,
          sortOrder: filter.sortOrder ?? 0,
        },
        update: {
          name: filter.name,
          sortOrder: filter.sortOrder ?? 0,
        },
      });
      result.listFilters += 1;
    }

    for (const form of mod.forms) {
      const formRow = await prisma.form.upsert({
        where: { moduleId_code: { moduleId: moduleRow.id, code: form.code } },
        create: {
          moduleId: moduleRow.id,
          code: form.code,
          name: form.name,
          sortOrder: form.sortOrder ?? 0,
        },
        update: {
          name: form.name,
          sortOrder: form.sortOrder ?? 0,
        },
      });
      result.forms += 1;

      for (const button of form.buttons ?? []) {
        await prisma.button.upsert({
          where: { formId_code: { formId: formRow.id, code: button.code } },
          create: {
            formId: formRow.id,
            code: button.code,
            name: button.name,
            variant: button.variant ?? 'default',
            sortOrder: button.sortOrder ?? 0,
          },
          update: {
            name: button.name,
            variant: button.variant ?? 'default',
            sortOrder: button.sortOrder ?? 0,
          },
        });
        result.buttons += 1;
      }

      for (const tab of form.tabs ?? []) {
        const tabRow = await prisma.tab.upsert({
          where: { formId_code: { formId: formRow.id, code: tab.code } },
          create: {
            formId: formRow.id,
            code: tab.code,
            name: tab.name,
            sortOrder: tab.sortOrder ?? 0,
          },
          update: {
            name: tab.name,
            sortOrder: tab.sortOrder ?? 0,
          },
        });
        result.tabs += 1;

        for (const section of tab.sections) {
          await upsertSection(formRow.id, tabRow.id, section, result);
        }
      }

      for (const section of form.sections ?? []) {
        await upsertSection(formRow.id, null, section, result);
      }
    }
  }

  for (const report of manifest.reports) {
    await prisma.reportDef.upsert({
      where: { code: report.code },
      create: {
        code: report.code,
        name: report.name,
        description: report.description,
        category: report.category,
      },
      update: {
        name: report.name,
        description: report.description,
        category: report.category,
      },
    });
    result.reports += 1;
  }

  for (const widget of manifest.dashboardWidgets) {
    await prisma.dashboardWidgetDef.upsert({
      where: { code: widget.code },
      create: {
        code: widget.code,
        name: widget.name,
        description: widget.description,
      },
      update: {
        name: widget.name,
        description: widget.description,
      },
    });
    result.dashboardWidgets += 1;
  }

  return result;
}

async function upsertSection(
  formId: string,
  tabId: string | null,
  section: SectionDef,
  result: RegistrySyncResult,
): Promise<void> {
  const sectionRow = await prisma.section.upsert({
    where: { formId_code: { formId, code: section.code } },
    create: {
      formId,
      tabId,
      code: section.code,
      name: section.name,
      sortOrder: section.sortOrder ?? 0,
    },
    update: {
      tabId,
      name: section.name,
      sortOrder: section.sortOrder ?? 0,
    },
  });
  result.sections += 1;

  for (const field of section.fields) {
    await prisma.field.upsert({
      where: { sectionId_code: { sectionId: sectionRow.id, code: field.code } },
      create: {
        sectionId: sectionRow.id,
        code: field.code,
        name: field.name,
        dataType: field.dataType,
        defaultRequired: field.defaultRequired ?? false,
        defaultMaskPattern: field.defaultMaskPattern,
        isPii: field.isPii ?? false,
        sortOrder: field.sortOrder ?? 0,
      },
      update: {
        name: field.name,
        dataType: field.dataType,
        defaultRequired: field.defaultRequired ?? false,
        defaultMaskPattern: field.defaultMaskPattern,
        isPii: field.isPii ?? false,
        sortOrder: field.sortOrder ?? 0,
      },
    });
    result.fields += 1;
  }
}
