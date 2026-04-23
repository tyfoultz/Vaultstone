import type { SectionTemplate, TemplateKey } from '@vaultstone/types';

import blankV1 from './blank.v1.json';
import factionsV1 from './factions.v1.json';
import factionsV2 from './factions.v2.json';
import locationsV1 from './locations.v1.json';
import loreV1 from './lore.v1.json';
import npcsV1 from './npcs.v1.json';
import npcsV2 from './npcs.v2.json';
import playersV1 from './players.v1.json';
import timelineV1 from './timeline.v1.json';

const REGISTRY: Record<TemplateKey, SectionTemplate[]> = {
  locations: [locationsV1 as SectionTemplate],
  npcs: [npcsV1 as SectionTemplate, npcsV2 as SectionTemplate],
  players: [playersV1 as SectionTemplate],
  factions: [factionsV1 as SectionTemplate, factionsV2 as SectionTemplate],
  lore: [loreV1 as SectionTemplate],
  blank: [blankV1 as SectionTemplate],
  timeline: [timelineV1 as SectionTemplate],
};

export function getLatestVersion(key: TemplateKey): number {
  const versions = REGISTRY[key];
  if (!versions || versions.length === 0) {
    throw new Error(`Unknown template key: ${key}`);
  }
  return versions.reduce((max, t) => (t.version > max ? t.version : max), 0);
}

export function getTemplate(key: TemplateKey, version?: number): SectionTemplate {
  const versions = REGISTRY[key];
  if (!versions || versions.length === 0) {
    throw new Error(`Unknown template key: ${key}`);
  }
  const target = version ?? getLatestVersion(key);
  const found = versions.find((t) => t.version === target);
  if (!found) {
    throw new Error(`Template ${key}@v${target} not registered`);
  }
  return found;
}

export interface TemplateSummary {
  key: TemplateKey;
  label: string;
  description: string;
  icon: string;
  railIcon: string;
  accentToken: SectionTemplate['accentToken'];
  defaultSectionView: SectionTemplate['defaultSectionView'];
  latestVersion: number;
}

export function listTemplates(): TemplateSummary[] {
  return (Object.keys(REGISTRY) as TemplateKey[]).map((key) => {
    const latest = getTemplate(key);
    return {
      key,
      label: latest.label,
      description: latest.description,
      icon: latest.icon,
      railIcon: latest.railIcon,
      accentToken: latest.accentToken,
      defaultSectionView: latest.defaultSectionView,
      latestVersion: latest.version,
    };
  });
}
