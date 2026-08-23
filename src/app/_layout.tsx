import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { useEffect } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { ensureNotificationInfrastructure, scheduleDailyReminder } from '@/core/notifications';
import { useSettingsStore } from '@/stores/settings-store';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const hydrate = useSettingsStore((s) => s.hydrate);

  // Pull persisted preferences from SQLite on the first render so the
  // home tab and audio wrapper see the right accent / daily quota.
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Boot-time sync: install the notification handler + Android
  // channel, and (re)install the daily reminder from the persisted
  // setting. We re-schedule every launch so toggling the time in
  // Settings always wins, even if the user re-installs the app.
  useEffect(() => {
    const unsub = useSettingsStore.subscribe((state) => {
      // Only act when hydration has finished — otherwise we'd schedule
      // a reminder with the default time before the user's real
      // preference is loaded.
      if (!state.hydrated) return;
      void (async () => {
        await ensureNotificationInfrastructure();
        await scheduleDailyReminder({
          enabled: state.reminderEnabled,
          hour: state.reminderHour,
          minute: state.reminderMinute,
        });
      })();
    });
    return () => unsub();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
