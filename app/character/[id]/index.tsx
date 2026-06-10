// Thin route wrapper around the reusable <CharacterSheet> component.
// The actual sheet (state, render, modals, ~4k lines) lives in
// components/character-sheet/CharacterSheet.tsx so it can be embedded
// in the campaign page's split pane alongside the standalone route.
//
// The AI assistant pill is hosted HERE (not inside CharacterSheet) so it only
// appears on the standalone route — not when the sheet is embedded in the
// campaign split pane, where the campaign-level assistant already exists.
import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  getCharacterById, getCampaignById, getWorldsForCampaign,
} from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import { CharacterSheet } from '../../../components/character-sheet/CharacterSheet';
import { AiAssistantHost } from '../../../components/ai/AiAssistantHost';
import type { AiChatSeed } from '../../../components/ai/AiChatContext';

export default function CharacterSheetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const [seed, setSeed] = useState<AiChatSeed | null>(null);

  useEffect(() => {
    if (!id || !user) {
      setSeed(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: char } = await getCharacterById(id);
      if (cancelled || !char || !char.campaign_id) return;
      // Player path: only the character's owner gets the assistant here; a DM
      // viewing a player's sheet uses the campaign assistant instead.
      if (char.user_id !== user.id) return;

      const { data: campaign } = await getCampaignById(char.campaign_id);
      if (cancelled || !campaign) return;
      const ai = (campaign.ai_settings ?? {}) as { playerAccessEnabled?: boolean };
      const isDM = campaign.dm_user_id === user.id;
      if (!isDM && ai.playerAccessEnabled !== true) return;

      // Resolve the linked world (optional — enables the world tools).
      const { data: worldRows } = await getWorldsForCampaign(char.campaign_id);
      const rows = (worldRows ?? []) as unknown as Array<{ worlds: { id: string } | null }>;
      const worldId = rows.find((r) => r.worlds)?.worlds?.id;
      if (cancelled) return;

      setSeed({
        userId: user.id,
        role: isDM ? 'dm' : 'player',
        campaignId: char.campaign_id,
        worldId,
        characterId: id,
      });
    })();
    return () => { cancelled = true; };
  }, [id, user]);

  if (!id) return null;
  return (
    <>
      <CharacterSheet characterId={id} />
      <AiAssistantHost seed={seed} />
    </>
  );
}
