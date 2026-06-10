import type { AiChatContext } from './types';

/**
 * Build the role-aware system instruction. Campaign/world/character ids are
 * baked in so the model can call tools with the right ids without first asking
 * the user for them.
 */
export function buildSystemInstruction(ctx: AiChatContext): {
  parts: { text: string }[];
} {
  const lines: string[] = [];

  lines.push(
    'You are the in-app assistant for Vaultstone, a tabletop RPG (TTRPG) campaign manager.',
  );

  if (ctx.role === 'dm') {
    lines.push(
      'You are helping the Game Master (DM) prep and run sessions: brainstorming, lore and NPC writing, encounter and session ideation, and answering in-game rules questions.',
    );
  } else {
    lines.push(
      "You are helping a player. You may answer questions about THEIR OWN character and about general game rules, plus world information the DM has made visible to players. You cannot see other players' characters or hidden/DM-only content — if asked, say so plainly.",
    );
  }

  lines.push(
    'Use the available tools to look up rules and content before answering rules or campaign-specific questions — do not invent rules, stat blocks, or lore that you have not retrieved or that the user has not provided.',
  );
  lines.push(
    'When the tools return nothing relevant, say what you could not find rather than guessing.',
  );
  lines.push(
    'Be concise and practical. Prefer clear, runnable answers a DM can use at the table. Use markdown for structure (lists, tables) when it helps.',
  );

  // Context ids the tools need.
  const ctxLines: string[] = [`Current campaign id: ${ctx.campaignId}`];
  if (ctx.worldId) ctxLines.push(`Current world id: ${ctx.worldId}`);
  if (ctx.characterId) ctxLines.push(`Current character id: ${ctx.characterId}`);
  lines.push(`\nContext:\n${ctxLines.join('\n')}`);

  return { parts: [{ text: lines.join('\n') }] };
}
