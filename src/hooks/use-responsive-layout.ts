import { useMemo } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset, Spacing } from '@/constants/theme';
import { useHydrated } from '@/hooks/use-hydrated';

export const CompactWebBreakpoint = 640;
export const CompactWebTabBarHeight = 72;

export function useHydratedWindowDimensions() {
  const dimensions = useWindowDimensions();
  const isHydrated = useHydrated();

  if (Platform.OS === 'web' && !isHydrated) {
    return { ...dimensions, width: 0 };
  }

  return dimensions;
}

export function useResponsiveLayout() {
  const safeAreaInsets = useSafeAreaInsets();
  const { width } = useHydratedWindowDimensions();
  const isCompact = Platform.OS === 'web' && width < CompactWebBreakpoint;

  const contentInset = useMemo(
    () => ({
      top:
        Platform.OS === 'web'
          ? isCompact
            ? Spacing.three
            : 92
          : safeAreaInsets.top + Spacing.three,
      bottom:
        safeAreaInsets.bottom +
        (isCompact ? CompactWebTabBarHeight : BottomTabInset) +
        Spacing.five,
      left: safeAreaInsets.left,
      right: safeAreaInsets.right,
    }),
    [isCompact, safeAreaInsets],
  );

  return { contentInset, isCompact };
}
