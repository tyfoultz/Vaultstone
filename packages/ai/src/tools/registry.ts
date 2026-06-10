import type {
  AiRole,
  AiChatContext,
  GeminiFunctionDeclaration,
  GeminiTool,
} from '../types';
import { searchContentTool } from './search-content';
import { getCharacterTool } from './get-character';
import { listCampaignCharactersTool } from './list-campaign-characters';
import { listWorldPagesTool } from './list-world-pages';
import { getWorldPageTool } from './get-world-page';
import { getCampaignTool } from './get-campaign';

/**
 * A client-side tool. `execute` runs in the app under the user's authenticated
 * Supabase session, so RLS scopes what it can read. `roles` gates which roles
 * may call it; per-argument scoping (e.g. a player only reading their own
 * character) lives inside each tool's `execute` using `ctx.role`.
 */
export interface ToolDefinition {
  declaration: GeminiFunctionDeclaration;
  roles: AiRole[];
  execute: (
    args: Record<string, unknown>,
    ctx: AiChatContext,
  ) => Promise<Record<string, unknown>>;
}

// Single source of truth for the tool set (mirrors the IMPORT_KINDS registry
// pattern). Add new tools here.
const ALL_TOOLS: ToolDefinition[] = [
  searchContentTool,
  getCharacterTool,
  listCampaignCharactersTool,
  listWorldPagesTool,
  getWorldPageTool,
  getCampaignTool,
];

/** Tool declarations Gemini is allowed to call for this role. */
export function toolsForRole(role: AiRole): GeminiTool[] {
  const declarations = ALL_TOOLS.filter((t) => t.roles.includes(role)).map(
    (t) => t.declaration,
  );
  return declarations.length > 0 ? [{ functionDeclarations: declarations }] : [];
}

export function findTool(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find((t) => t.declaration.name === name);
}
