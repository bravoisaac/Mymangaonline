import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import type { Href } from 'expo-router';
import { Pressable, View, StyleSheet, useWindowDimensions } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { CompactWebBreakpoint } from '@/hooks/use-responsive-layout';

const SCRAPERS_HREF = '/scrapers' as Href;

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>Inicio</TabButton>
          </TabTrigger>
          <TabTrigger name="reader" href="/reader" asChild>
            <TabButton>Explorar</TabButton>
          </TabTrigger>
          <TabTrigger name="library" href="/library" asChild>
            <TabButton>Mis mangas</TabButton>
          </TabTrigger>
          <TabTrigger name="scrapers" href={SCRAPERS_HREF} asChild>
            <TabButton>Scrapers</TabButton>
          </TabTrigger>
          <TabTrigger name="manga" href="/manga" asChild>
            <Pressable style={styles.hiddenTab}>
              <View />
            </Pressable>
          </TabTrigger>
          <TabTrigger name="chapter" href="/chapter" asChild>
            <Pressable style={styles.hiddenTab}>
              <View />
            </Pressable>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < CompactWebBreakpoint;

  return (
    <Pressable
      {...props}
      style={({ pressed }) => [isCompact && styles.tabButton, pressed && styles.pressed]}>
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.tabButtonView}>
        <ThemedText type="small" themeColor={isFocused ? 'text' : 'textSecondary'}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < CompactWebBreakpoint;

  return (
    <View
      {...props}
      style={[
        styles.tabListContainer,
        isCompact ? styles.compactTabListContainer : styles.desktopTabListContainer,
      ]}>
      <ThemedView
        type="backgroundElement"
        style={[styles.innerContainer, isCompact && styles.compactInnerContainer]}>
        {!isCompact && (
          <ThemedText type="smallBold" style={styles.brandText}>
            My Manga Online
          </ThemedText>
        )}

        {props.children}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    zIndex: 10,
  },
  desktopTabListContainer: {
    top: 0,
    padding: Spacing.three,
  },
  compactTabListContainer: {
    bottom: 0,
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
    borderRadius: Spacing.five,
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  compactInnerContainer: {
    width: '100%',
    maxWidth: '100%',
    flexGrow: 0,
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.one,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: 'rgba(120, 130, 150, 0.2)',
  },
  brandText: {
    marginRight: 'auto',
  },
  pressed: {
    opacity: 0.7,
  },
  tabButton: {
    flex: 1,
    minWidth: 0,
  },
  tabButtonView: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.three,
  },
  hiddenTab: {
    display: 'none',
  },
});
