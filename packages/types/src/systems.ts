export type ResourceRecharge = 'short_rest' | 'long_rest' | 'daily' | 'per_scene';

export interface ResourcePool {
  key: string;
  label: string;
  max: number | null; // null = derived from character level/class
  recharge: ResourceRecharge;
}

export interface AttributeDefinition {
  key: string;
  label: string;
  type: 'number' | 'string' | 'enum';
  options?: string[]; // for enum types
  derivedFrom?: string; // e.g. 'strength' for 'strength_modifier'
  derivation?: 'modifier_5e'; // known derivation functions
}

export interface CreationStep {
  key: string;
  label: string;
  contentCollection: string; // which ContentResolver collection to query for options
  required: boolean;
}

export interface SheetSection {
  key: string;
  label: string;
  order: number;
}

export interface GameSystemDefinition {
  id: string;
  displayName: string;
  version: string;
  license: string;
  isBundled: boolean;
  attributes: AttributeDefinition[];
  resourcePools: ResourcePool[];
  creationSteps: CreationStep[];
  sheetSections: SheetSection[];
}
