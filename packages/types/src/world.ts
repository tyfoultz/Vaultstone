import type { Database } from './database.types';

export type TemplateKey =
  | 'locations'
  | 'npcs'
  | 'players'
  | 'factions'
  | 'lore'
  | 'blank'
  | 'timeline';

export type PageKind =
  | 'custom'
  | 'location'
  | 'npc'
  | 'faction'
  | 'religion'
  | 'organization'
  | 'item'
  | 'lore'
  | 'timeline'
  | 'pc_stub'
  | 'player_character';

export type FieldType =
  | 'text'
  | 'long_text'
  | 'select'
  | 'tags'
  | 'page_ref'
  | 'number'
  | 'date_freeform'
  | 'pc_ref';

export type SectionView = 'grid' | 'list';

export type AccentToken = 'primary' | 'player' | 'gm' | 'cosmic' | 'danger';

export interface StructuredField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  pageKindFilter?: PageKind[];
  helpText?: string;
  required?: boolean;
  placeholder?: string;
}

export interface SectionTemplate {
  key: TemplateKey;
  version: number;
  label: string;
  description: string;
  defaultPageKind: PageKind;
  allowedPageKinds: PageKind[];
  defaultSectionView: SectionView;
  fields: StructuredField[];
  icon: string;
  railIcon: string;
  accentToken: AccentToken;
}

export type WorldSection = Database['public']['Tables']['world_sections']['Row'];
export type WorldSectionInsert = Database['public']['Tables']['world_sections']['Insert'];
export type WorldSectionUpdate = Database['public']['Tables']['world_sections']['Update'];

export type WorldPage = Database['public']['Tables']['world_pages']['Row'];
export type WorldPageInsert = Database['public']['Tables']['world_pages']['Insert'];
export type WorldPageUpdate = Database['public']['Tables']['world_pages']['Update'];

export type WorldPagePermission = Database['public']['Tables']['world_page_permissions']['Row'];
export type WorldPagePermissionLevel = Database['public']['Enums']['world_page_permission_level'];

export interface WorldPageTreeNode {
  page: WorldPage;
  children: WorldPageTreeNode[];
  depth: number;
}

// ─── Timeline types ──────────────────────────────────────────────────────

export type CalendarUnitType = 'text' | 'number' | 'ordered_list';

export interface CalendarUnit {
  key: string;
  label: string;
  type: CalendarUnitType;
  options?: string[];
}

export interface EraDefinition {
  key: string;
  label: string;
  dateLevels: CalendarUnit[];
}

export interface TimelineCalendarSchema {
  eras: EraDefinition[];
}

/** @deprecated Use TimelineCalendarSchema — kept for migration compatibility */
export type CalendarSchema = CalendarUnit[];

export type TimelineEvent = Database['public']['Tables']['timeline_events']['Row'];
export type TimelineEventInsert = Database['public']['Tables']['timeline_events']['Insert'];
export type TimelineEventUpdate = Database['public']['Tables']['timeline_events']['Update'];
