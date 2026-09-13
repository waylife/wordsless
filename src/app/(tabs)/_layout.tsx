/**
 * Layout for the tab-group directory. Renders the NativeTabs navigator
 * so that tab routes (index / review / stats / settings) are handled
 * by NativeTabs, while non-tab routes (wordbooks/, study/) are handled
 * by the outer Stack at the app root.
 */
import AppTabs from '@/components/app-tabs';

export default function TabsLayout() {
  return <AppTabs />;
}
