import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/colors';
import { ReactNode } from 'react';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  testID?: string;
}

/** Simple modal sheet used for PIN confirmation, filters and pickers. */
export function Sheet({ visible, onClose, title, children, testID }: SheetProps) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} testID={testID}>
      <View style={[styles.overlay, { backgroundColor: theme.colors.overlay }]}>
        <Pressable style={styles.flex} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.background,
              borderTopLeftRadius: theme.radius.xl,
              borderTopRightRadius: theme.radius.xl,
            },
          ]}
        >
          <View style={styles.handle} />
          {title ? (
            <Text style={[typography.subtitle, { color: theme.colors.text, marginBottom: 12 }]}>{title}</Text>
          ) : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  flex: {
    flex: 1,
  },
  sheet: {
    padding: 24,
    paddingBottom: 36,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#818B83',
    alignSelf: 'center',
    marginBottom: 18,
  },
});
