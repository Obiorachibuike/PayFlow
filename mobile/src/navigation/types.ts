import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  VerifyEmail: { email: string; demoCode?: string };
  ForgotPassword: undefined;
  ResetPassword: { email: string; token?: string };
};

export type HomeStackParamList = {
  Home: undefined;
  Notifications: undefined;
  TransactionDetails: { transactionId: string };
};

export type TransactionsStackParamList = {
  TransactionsList: undefined;
  TransactionDetails: { transactionId: string };
};

export type ActivityStackParamList = {
  Activity: undefined;
  TransactionDetails: { transactionId: string };
};

export type CardsStackParamList = {
  Cards: undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
  EditProfile: undefined;
  Security: undefined;
  ChangePassword: undefined;
  ChangePin: undefined;
  Settings: undefined;
  Sessions: undefined;
  Beneficiaries: undefined;
  AddBeneficiary: undefined;
  Ledger: undefined;
};

export type WalletStackParamList = {
  FundWallet: undefined;
  SendMoney: undefined;
  Withdraw: undefined;
};

export type MainTabsParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Transactions: NavigatorScreenParams<TransactionsStackParamList>;
  Cards: NavigatorScreenParams<CardsStackParamList>;
  Activity: NavigatorScreenParams<ActivityStackParamList>;
  Profile: NavigatorScreenParams<ProfileStackParamList>;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabsParamList>;
  FundWallet: undefined;
  SendMoney: undefined;
  Withdraw: undefined;
  AddBeneficiary: undefined;
};
