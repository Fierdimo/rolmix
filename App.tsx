import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from './hooks/useAuth';
import AuthScreen from './screens/AuthScreen';
import RoomsScreen from './screens/RoomsScreen';
import ChatScreen from './screens/ChatScreen';
import CharactersScreen from './screens/CharactersScreen';
import CharacterEditorScreen from  './screens/CharacterEditorScreen';

export type RootStackParamList = {
  Auth: undefined;
  Sessions: undefined;
  Chat: { sessionId: string; sessionName: string };
  Characters: undefined;
  CharacterEditor: { characterId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function Navigation() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f0c29', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#7c3aed" size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {session ? (
        <>
          <Stack.Screen name="Sessions" component={RoomsScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="Characters" component={CharactersScreen} />
          <Stack.Screen name="CharacterEditor" component={CharacterEditorScreen} />
        </>
      ) : (
        <Stack.Screen name="Auth" component={AuthScreen} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Navigation />
    </NavigationContainer>
  );
}
