import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { availableUpdate, useAppUpdate } from '../../lib/appUpdate';
import { pendingCount, useLedger } from '../../store/ledger';
import { useCan, useSession } from '../../store/session';
import { colors } from '../../ui/theme';
import { useWide } from '../../ui/layout';

export default function TabsLayout() {
  const signedIn = useSession((s) => Boolean(s.currentUserId));
  const hasUpdate = useAppUpdate((s) => Boolean(availableUpdate(s.latest)));
  const canSell = useCan('sell');
  const canSales = useCan('viewSales');
  const canCustomers = useCan('viewCustomers');
  const canStock = useCan('viewStock');
  const unsynced = useLedger(useShallow((s) => pendingCount(s)));
  const wide = useWide();

  if (!signedIn) return <Redirect href="/login" />;

  const icon = (name: keyof typeof Ionicons.glyphMap) =>
    ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} size={size} color={color as string} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        // counter PCs / tablets: a navigation rail on the left; phones: tabs at the bottom
        ...(wide
          ? {
            tabBarPosition: 'left' as const,
            tabBarVariant: 'material' as const,
            tabBarLabelPosition: 'below-icon' as const,
            tabBarStyle: { backgroundColor: colors.surface, borderRightColor: colors.border, width: 124, paddingTop: 12 },
            tabBarActiveBackgroundColor: colors.primarySoft,
            tabBarItemStyle: { borderRadius: 14, marginHorizontal: 6, marginVertical: 2, paddingVertical: 8 },
            tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
          }
          : {
            tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 62, paddingBottom: 8, paddingTop: 6 },
            tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          }),
      }}
    >
      <Tabs.Screen name="sell" options={{ title: 'Sell', tabBarIcon: icon('cart'), href: canSell ? undefined : null }} />
      <Tabs.Screen name="sales" options={{ title: 'Sales', tabBarIcon: icon('receipt'), href: canSales ? undefined : null }} />
      <Tabs.Screen name="customers" options={{ title: 'Customers', tabBarIcon: icon('people'), href: canCustomers ? undefined : null }} />
      <Tabs.Screen name="stock" options={{ title: 'Stock', tabBarIcon: icon('cube'), href: canStock ? undefined : null }} />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: icon('ellipsis-horizontal-circle'),
          // sync problems first; otherwise a dot when a newer SAC-POS is waiting (More → App update)
          tabBarBadge: unsynced.review ? '!' : unsynced.pending || (hasUpdate ? '↑' : undefined),
          tabBarBadgeStyle: { backgroundColor: unsynced.review ? colors.danger : unsynced.pending ? colors.warning : colors.primary, fontSize: 10 },
        }}
      />
    </Tabs>
  );
}
