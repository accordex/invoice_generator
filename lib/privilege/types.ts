/** Supported field data types in the product manifest. */
export type FieldDataType =
  | 'TEXT'
  | 'NUMBER'
  | 'DATE'
  | 'EMAIL'
  | 'PHONE'
  | 'SELECT'
  | 'TEXTAREA'
  | 'FILE'
  | 'CURRENCY'
  | 'RADIO';

/** Field definition within a form section. */
export interface FieldDef {
  code: string;
  name: string;
  dataType: FieldDataType;
  defaultRequired?: boolean;
  defaultMaskPattern?: string;
  isPii?: boolean;
  sortOrder?: number;
}

/** Section definition within a form (optionally nested under a tab). */
export interface SectionDef {
  code: string;
  name: string;
  fields: FieldDef[];
  sortOrder?: number;
}

/** Tab definition within a tabbed form. */
export interface TabDef {
  code: string;
  name: string;
  sections: SectionDef[];
  sortOrder?: number;
}

/** Button definition on a form. */
export interface ButtonDef {
  code: string;
  name: string;
  variant?: string;
  sortOrder?: number;
}

/** Form definition within a module. */
export interface FormDef {
  code: string;
  name: string;
  tabs?: TabDef[];
  sections?: SectionDef[];
  buttons?: ButtonDef[];
  sortOrder?: number;
}

/** Imperative action on a module. */
export interface ActionDef {
  code: string;
  name: string;
  isHighRisk?: boolean;
}

/** Bulk action on a module list view. */
export interface BulkActionDef {
  code: string;
  name: string;
  isHighRisk?: boolean;
}

/** Status transition definition for workflow gating. */
export interface StatusTransitionDef {
  code: string;
  name: string;
  fromStatus: string;
  toStatus: string;
}

/** Record scope definition controlling row-level visibility. */
export interface RecordScopeDef {
  code?: string;
  name: string;
  ownerField?: string;
  teamField?: string;
  branchField?: string;
  departmentField?: string;
}

/** List column definition for table views. */
export interface ListColumnDef {
  code: string;
  name: string;
  fieldCode?: string;
  defaultMaskPattern?: string;
  sortOrder?: number;
}

/** List filter definition for table views. */
export interface ListFilterDef {
  code: string;
  name: string;
  sortOrder?: number;
}

/** Top-level module definition in the product manifest. */
export interface ModuleDef {
  code: string;
  name: string;
  icon?: string;
  sortOrder?: number;
  forms: FormDef[];
  actions: ActionDef[];
  bulkActions: BulkActionDef[];
  transitions: StatusTransitionDef[];
  scopes: RecordScopeDef[];
  listColumns: ListColumnDef[];
  listFilters: ListFilterDef[];
}

/** Sidebar / navigation menu item. */
export interface MenuItemDef {
  code: string;
  name: string;
  icon?: string;
  route?: string;
  parentCode?: string;
  sortOrder?: number;
}

/** Report definition. */
export interface ReportDef {
  code: string;
  name: string;
  description?: string;
  category?: string;
}

/** Dashboard widget definition. */
export interface WidgetDef {
  code: string;
  name: string;
  description?: string;
}

/**
 * Complete product privilege manifest — the single source of truth for registry seeding.
 * Only this file changes when porting the privilege engine to another product.
 */
export interface ProductManifest {
  product: { code: string; name: string };
  menuItems: MenuItemDef[];
  modules: ModuleDef[];
  reports: ReportDef[];
  dashboardWidgets: WidgetDef[];
}
