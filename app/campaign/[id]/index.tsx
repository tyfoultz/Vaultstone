// Campaign detail route. The V2 redesign is now the only layout —
// the legacy V1 dashboard was removed once V2 reached parity.
//
// Sub-routes (combat, party, notes, recap, rulebook, etc.) still
// live in their own files at `/campaign/[id]/<route>` and are
// reached via the V2 page's primary action card and references row.

import { useLocalSearchParams } from 'expo-router';
import { CampaignPageV2 } from '../../../components/campaign/CampaignPageV2';

export default function CampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <CampaignPageV2 campaignId={id} />;
}
