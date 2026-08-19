import { useSyncExternalStore } from 'react';
import type { ColorSchemeName } from 'react-native';
import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * On web, `useColorScheme()` from `react-native` is only meaningful after the component has
 * hydrated on the client. We use `useSyncExternalStore` to detect hydration without the
 * anti-pattern of calling `setState` directly inside a `useEffect` body.
 */
const noopSubscribe = () => () => undefined;

export function useColorScheme(): ColorSchemeName {
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const systemScheme = useRNColorScheme();
  return isClient ? systemScheme : 'light';
}
