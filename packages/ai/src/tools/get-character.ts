import { getCharacterById } from '@vaultstone/api';
import { getClassEntries } from '@vaultstone/types';
import type { Dnd5eStats, Dnd5eResources } from '@vaultstone/types';
import type { ToolDefinition } from './registry';
import { prettifyKey } from './util';

/**
 * A character card for the assistant. DMs may read any character in the
 * campaign; players may only read their own (enforced here on top of RLS).
 */
export const getCharacterTool: ToolDefinition = {
  roles: ['dm', 'player'],
  declaration: {
    name: 'get_character',
    description:
      "Get a summary of a character: level, class(es), species, ability scores, HP, conditions, and proficiencies. Use when answering questions about a specific character. A player may only read their own character.",
    parameters: {
      type: 'object',
      properties: {
        characterId: {
          type: 'string',
          description: 'The character id to look up.',
        },
      },
      required: ['characterId'],
    },
  },
  execute: async (args, ctx) => {
    // Fall back to the context character id so players opening the assistant
    // from their campaign view don't have to know their own character id.
    const characterId = String(args.characterId ?? ctx.characterId ?? '').trim();
    if (!characterId) return { error: 'No characterId provided.' };

    const { data, error } = await getCharacterById(characterId);
    if (error || !data) {
      return { error: 'Character not found or not accessible.' };
    }

    // Player scope: own character only (RLS may allow reading party-mates).
    if (ctx.role === 'player' && data.user_id !== ctx.userId) {
      return { error: 'You can only ask about your own character.' };
    }

    const stats = (data.base_stats ?? null) as Dnd5eStats | null;
    const resources = (data.resources ?? null) as Dnd5eResources | null;

    const classes = stats
      ? getClassEntries(stats).map((c) => ({
          class: prettifyKey(c.classKey),
          level: c.level,
          subclass: c.subclassKey ? prettifyKey(c.subclassKey) : null,
        }))
      : [];

    return {
      character: {
        name: data.name,
        level: stats?.level ?? null,
        species: prettifyKey(stats?.speciesKey) || null,
        background: prettifyKey(stats?.backgroundKey) || null,
        classes,
        abilityScores: stats?.abilityScores ?? null,
        hp:
          resources && stats
            ? { current: resources.hpCurrent, max: stats.hpMax, temp: resources.hpTemp }
            : null,
        acOverride: stats?.acOverride ?? null,
        speed: stats?.speed ?? null,
        size: stats?.size ?? null,
        spellcastingAbility: stats?.spellcastingAbility ?? null,
        skillProficiencies: stats?.skillProficiencies ?? [],
        savingThrowProficiencies: stats?.savingThrowProficiencies ?? [],
        conditions: data.conditions ?? [],
        exhaustionLevel: resources?.exhaustionLevel ?? 0,
      },
    };
  },
};
