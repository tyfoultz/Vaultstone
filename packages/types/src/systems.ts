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

/**
 * Which bundled SRD revision this system pulls its baseline content from.
 * `null` means the system has no SRD-tagged content (Custom, future homebrew systems).
 */
export type SrdVersion = 'SRD_5.1' | 'SRD_2.0';

export interface GameSystemDefinition {
  id: string;
  displayName: string;
  version: string;
  license: string;
  isBundled: boolean;
  /**
   * Filters which bundled SRD records this system surfaces. SRD items carry
   * `srdVersions: SrdVersion[]`; a system with `srdVersion: 'SRD_5.1'` only
   * shows items whose `srdVersions` array includes 'SRD_5.1'. `null` skips
   * SRD filtering entirely (e.g. Custom).
   */
  srdVersion: SrdVersion | null;
  attributes: AttributeDefinition[];
  resourcePools: ResourcePool[];
  creationSteps: CreationStep[];
  sheetSections: SheetSection[];
}
