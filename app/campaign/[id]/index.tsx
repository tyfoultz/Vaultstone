import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function CampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View>
      <Text>Campaign {id}</Text>
    </View>
  );
}
