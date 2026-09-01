import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';
import { View, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';

import { MaxContentWidth, Spacing } from '@/constants/theme';

// Single destination for now, so there's nothing to switch between visibly —
// but the Tabs navigator still needs at least one registered TabTrigger or
// it throws ("Couldn't find any screens for the navigator"), so it stays,
// just visually hidden. Bring a visible tab bar back (see git history for
// the previous version) once a second destination exists, e.g. a
// newsletter archive.
export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList style={styles.hidden}>
        <TabTrigger name="home" href="/" />
      </TabList>
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <ThemedText type="smallBold">💌 The Monthly Catch-Up</ThemedText>
        </View>
      </View>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  hidden: {
    display: 'none',
  },
  header: {
    position: 'absolute',
    top: 0,
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  headerInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
});
