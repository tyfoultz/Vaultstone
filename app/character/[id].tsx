import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function CharacterSheetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View>
      <Text>Character Sheet {id}</Text>
    </View>
  );
}
