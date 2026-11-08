import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useAppSelector } from '../store/hooks';
import { HomeScreen } from '../screens/home/HomeScreen';
import { TransactionsScreen } from '../screens/transactions/TransactionsScreen';
import { CardsScreen } from '../screens/cards/CardsScreen';
import { ActivityScreen } from '../screens/activity/ActivityScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { TransactionDetailsScreen } from '../screens/transactions/TransactionDetailsScreen';
import { NotificationsScreen } from '../screens/home/NotificationsScreen';
import { EditProfileScreen } from '../screens/profile/EditProfileScreen';
import { SecurityScreen } from '../screens/profile/SecurityScreen';
import { ChangePasswordScreen } from '../screens/profile/ChangePasswordScreen';
import { ChangePinScreen } from '../screens/profile/ChangePinScreen';
import { SettingsScreen } from '../screens/profile/SettingsScreen';
import { SessionsScreen } from '../screens/profile/SessionsScreen';
import { BeneficiariesScreen } from '../screens/beneficiaries/BeneficiariesScreen';
import { LedgerScreen } from '../screens/profile/LedgerScreen';
import type {
  ActivityStackParamList,
  CardsStackParamList,
  HomeStackParamList,
  MainTabsParamList,
  ProfileStackParamList,
  TransactionsStackParamList,
} from './types';

const Tab = createBottomTabNavigator<MainTabsParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const TransactionsStack = createNativeStackNavigator<TransactionsStackParamList>();
const CardsStack = createNativeStackNavigator<CardsStackParamList>();
const ActivityStack = createNativeStackNavigator<ActivityStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  const theme = useTheme();
  return (
    <Ionicons
      name={name}
      size={22}
      color={focused ? theme.colors.primary : theme.colors.textMuted}
      accessibilityRole="image"
    />
  );
}

function screenOptionsFor(theme: ReturnType<typeof useTheme>) {
  return {
    headerShown: true as const,
    headerStyle: { backgroundColor: theme.colors.background },
    headerTitleStyle: { color: theme.colors.text, fontWeight: '700' as const },
    headerShadowVisible: false,
    headerTintColor: theme.colors.primary,
  };
}

function HomeStackScreen() {
  const theme = useTheme();
  return (
    <HomeStack.Navigator screenOptions={screenOptionsFor(theme)}>
      <HomeStack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Activity feed' }} />
      <HomeStack.Screen
        name="TransactionDetails"
        component={TransactionDetailsScreen}
        options={{ title: 'Transaction' }}
      />
    </HomeStack.Navigator>
  );
}

function TransactionsStackScreen() {
  const theme = useTheme();
  return (
    <TransactionsStack.Navigator screenOptions={screenOptionsFor(theme)}>
      <TransactionsStack.Screen
        name="TransactionsList"
        component={TransactionsScreen}
        options={{ title: 'Transactions' }}
      />
      <TransactionsStack.Screen
        name="TransactionDetails"
        component={TransactionDetailsScreen}
        options={{ title: 'Transaction' }}
      />
    </TransactionsStack.Navigator>
  );
}

function CardsStackScreen() {
  const theme = useTheme();
  return (
    <CardsStack.Navigator screenOptions={screenOptionsFor(theme)}>
      <CardsStack.Screen name="Cards" component={CardsScreen} options={{ title: 'Cards' }} />
    </CardsStack.Navigator>
  );
}

function ActivityStackScreen() {
  const theme = useTheme();
  return (
    <ActivityStack.Navigator screenOptions={screenOptionsFor(theme)}>
      <ActivityStack.Screen name="Activity" component={ActivityScreen} options={{ title: 'Activity' }} />
      <ActivityStack.Screen
        name="TransactionDetails"
        component={TransactionDetailsScreen}
        options={{ title: 'Transaction' }}
      />
    </ActivityStack.Navigator>
  );
}

function ProfileStackScreen() {
  const theme = useTheme();
  return (
    <ProfileStack.Navigator screenOptions={screenOptionsFor(theme)}>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Edit profile' }} />
      <ProfileStack.Screen name="Security" component={SecurityScreen} options={{ title: 'Security' }} />
      <ProfileStack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ title: 'Change password' }}
      />
      <ProfileStack.Screen name="ChangePin" component={ChangePinScreen} options={{ title: 'Transaction PIN' }} />
      <ProfileStack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <ProfileStack.Screen name="Sessions" component={SessionsScreen} options={{ title: 'Devices' }} />
      <ProfileStack.Screen
        name="Beneficiaries"
        component={BeneficiariesScreen}
        options={{ title: 'Beneficiaries' }}
      />
      <ProfileStack.Screen name="Ledger" component={LedgerScreen} options={{ title: 'Ledger' }} />
    </ProfileStack.Navigator>
  );
}

export function MainNavigator() {
  const theme = useTheme();
  const unread = useAppSelector((state) => state.notifications.unreadCount);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.border,
          height: 62,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStackScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'home' : 'home-outline'} focused={focused} /> }}
      />
      <Tab.Screen
        name="Transactions"
        component={TransactionsStackScreen}
        options={{
          title: 'Transactions',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'swap-vertical' : 'swap-vertical-outline'} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Cards"
        component={CardsStackScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'card' : 'card-outline'} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Activity"
        component={ActivityStackScreen}
        options={{
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarBadgeStyle: { backgroundColor: theme.colors.primary, color: '#101510', fontWeight: '800' },
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'notifications' : 'notifications-outline'} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStackScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'person' : 'person-outline'} focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

