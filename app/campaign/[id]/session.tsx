import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View>
      <Text>Live Session — Campaign {id}</Text>
    </View>
  );
}
