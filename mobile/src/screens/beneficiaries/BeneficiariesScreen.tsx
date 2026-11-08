import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { useTheme } from '../../theme/ThemeProvider';
import { typography } from '../../theme/colors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { deleteBeneficiary, fetchBeneficiaries, updateBeneficiary } from '../../store/slices/beneficiariesSlice';
import type { ProfileStackParamList, RootStackParamList } from '../../navigation/types';
import type { Beneficiary } from '../../types/api';
import { useCallback, useEffect } from 'react';

type Navigation = NativeStackNavigationProp<ProfileStackParamList & RootStackParamList>;

export function BeneficiariesScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<Navigation>();

  const items = useAppSelector((state) => state.beneficiaries.items);
  const loading = useAppSelector((state) => state.beneficiaries.loading);

  const load = useCallback(() => {
    void dispatch(fetchBeneficiaries());
  }, [dispatch]);

  useEffect(() => {
    load();
  }, [load]);

  const renderItem = ({ item }: { item: Beneficiary }) => (
    <View
      testID={`beneficiary-${item.id}`}
      style={[
        styles.item,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[typography.bodyStrong, { color: theme.colors.text }]}>{item.accountName}</Text>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          {item.bankName} · {item.accountNumberMasked}
        </Text>
        <Text style={[typography.micro, { color: item.verified ? theme.colors.success : theme.colors.warning }]}>
          {item.verified ? 'VERIFIED' : 'UNVERIFIED — name entered by you'}
        </Text>
      </View>

      <View style={styles.actions}>
        {item.isDefault ? (
          <Text style={[typography.micro, { color: theme.colors.primary }]}>DEFAULT</Text>
        ) : (
          <Pressable
            accessibilityRole="button"
            testID={`beneficiary-default-${item.id}`}
            onPress={() => void dispatch(updateBeneficiary({ id: item.id, isDefault: true }))}
          >
            <Text style={[typography.caption, { color: theme.colors.primary }]}>Make default</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          testID={`beneficiary-delete-${item.id}`}
          onPress={() => void dispatch(deleteBeneficiary(item.id))}
          style={styles.delete}
        >
          <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <Screen padded={false} testID="beneficiaries-screen">
      {items.length === 0 && !loading ? (
        <EmptyState
          testID="beneficiaries-empty"
          title="No saved accounts yet"
          message="Save an account to withdraw to it in one tap. PayFlow never verifies these names with a bank."
          action={
            <Button
              testID="beneficiaries-add"
              label="Add beneficiary"
              onPress={() => navigation.navigate('AddBeneficiary')}
            />
          }
        />
      ) : (
        <>
          <FlatList
            testID="beneficiaries-list"
            data={items}
            keyExtractor={(item) => item.id}
            refreshing={loading}
            onRefresh={load}
            contentContainerStyle={styles.content}
            renderItem={renderItem}
          />
          <View style={styles.footer}>
            <Button
              testID="beneficiaries-add"
              label="Add beneficiary"
              size="lg"
              onPress={() => navigation.navigate('AddBeneficiary')}
            />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 10,
    paddingBottom: 24,
  },
  item: {
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  delete: {
    padding: 4,
  },
  footer: {
    padding: 16,
  },
});
