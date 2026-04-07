export type ContentTier = 'srd' | 'local' | 'homebrew';

export type ContentType =
  | 'spell'
  | 'monster'
  | 'item'
  | 'class'
  | 'species'
  | 'feature'
  | 'background'
  | 'feat';

export interface ContentResult {
  key: string;
  name: string;
  type: ContentType;
  tier: ContentTier;
  system: string;
  // Description text is only included for SRD and homebrew tiers.
  // Local (user-uploaded) descriptions stay on-device and are fetched separately.
  description?: string;
  data: Record<string, unknown>;
}

export interface SpellResult extends ContentResult {
  type: 'spell';
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string[];
  duration: string;
  concentration: boolean;
  classes: string[];
}

export interface CreatureResult extends ContentResult {
  type: 'monster';
  challengeRating: string | number;
  size: string;
  creatureType: string;
  alignment: string;
  ac: number;
  hp: number;
  speed: string;
}

export interface ContentQuery {
  search?: string;
  type?: ContentType;
  system?: string;
  tiers?: ContentTier[];
  filters?: Record<string, unknown>;
}
