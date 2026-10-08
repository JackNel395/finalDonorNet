/**
 * Console chrome: the staff access gate, the sidebar, the top bar, and the
 * content canvas.
 *
 * This replaced a single centred column whose navigation was three stacked
 * full-width `SegmentedControl`s (areas, then sub-areas, then filters). That is
 * the phone idiom this app is otherwise built in, and on a wide browser it read
 * as four striped bands and no information. A console is a desktop tool:
 * navigation belongs in a persistent left rail, filters belong in a compact
 * toolbar, and the horizontal space belongs to the data.
 *
 * Sub-areas are promoted into the sidebar rather than kept as a second row, so
 * every screen is one click from every other and the old `CentersSubNav` /
 * `ContentSubNav` pair is gone.
 *
 * The top bar carries two rows that answer different questions. The *global*
 * row — search, alerts, who am I signed in as — is identical on every screen
 * and never changes. The *title* row below it names the screen, and a screen
 * that already states its own name in its content (the overview's banner)
 * suppresses it with `showTitle={false}` rather than printing "Overview" twice.
 *
 * Local to src/components/admin rather than promoted to src/components/ui —
 * this is route-level scaffolding for one web-only surface, not a visual
 * primitive. Every module in here is web-only: each admin *route* imports a
 * component with a `.native.tsx` sibling, so the native bundle resolves none of
 * it.
 *
 * The gate is cosmetic: it exists so staff are not shown dead controls.
 * `requireAdmin` on every /api/admin route is the security boundary.
 */
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { ConsoleThemeProvider, useConsoleTheme } from '@/components/admin/console-theme';
import { DropMark } from '@/components/admin/marks';
import { ThemedText } from '@/components/themed-text';
import { EmptyState, Skeleton } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useAdminMe } from '@/hooks/api/admin/use-admin-me';
import { useTheme } from '@/hooks/use-theme';
import { ApiClientError } from '@/lib/api';
import { authClient } from '@/lib/auth-client';

/** Width below which the sidebar collapses to an icon rail on its own. */
const RAIL_BREAKPOINT = 1100;
const SIDEBAR_WIDTH = 287;
const RAIL_WIDTH = 72;
/** Caps line length on the widest monitors without stranding the table. */
const CONTENT_MAX = 1560;
/** Below this the search field is dropped rather than squeezed to a stub. */
const SEARCH_BREAKPOINT = 820;

export type AdminNavKey =
  | 'overview'
  | 'requests'
  | 'users'
  | 'centers'
  | 'appointments'
  | 'announcements'
  | 'articles'
  | 'broadcast';

type NavItem = {
  key: AdminNavKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Shown when the row is selected: the same glyph, filled. */
  iconActive: keyof typeof Ionicons.glyphMap;
  href: string;
};

type NavGroup = { label?: string; items: NavItem[] };

/**
 * The sidebar's full map. Every screen that exists is reachable from here;
 * nothing is hidden behind an in-page tab.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      {
        key: 'overview',
        label: 'Overview',
        icon: 'home-outline',
        iconActive: 'home',
        href: '/admin/overview',
      },
      {
        key: 'requests',
        label: 'Requests',
        icon: 'document-text-outline',
        iconActive: 'document-text',
        href: '/admin/requests',
      },
    ],
  },
  {
    label: 'People',
    items: [
      {
        key: 'users',
        label: 'Donors',
        icon: 'people-outline',
        iconActive: 'people',
        href: '/admin/users',
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        key: 'centers',
        label: 'Centers',
        icon: 'business-outline',
        iconActive: 'business',
        href: '/admin/centers',
      },
      {
        key: 'appointments',
        label: 'Appointments',
        icon: 'calendar-outline',
        iconActive: 'calendar',
        href: '/admin/appointments',
      },
    ],
  },
  {
    label: 'Content',
    items: [
      {
        key: 'announcements',
        label: 'Announcements',
        icon: 'megaphone-outline',
        iconActive: 'megaphone',
        href: '/admin/content',
      },
      {
        key: 'articles',
        label: 'Articles',
        icon: 'document-outline',
        iconActive: 'document',
        href: '/admin/articles',
      },
      {
        key: 'broadcast',
        label: 'Broadcast',
        icon: 'radio-outline',
        iconActive: 'radio',
        href: '/admin/broadcast',
      },
    ],
  },
];

/**
 * Resolves whether the viewer may use the console, then hands the role to its
 * child. A 403 or 401 is terminal — send them to the app rather than holding on
 * a blank screen; a transient failure is explained, not redirected.
 */
export function AdminGate({ children }: { children: (role: string) => ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const hasSession = !!session;
  // Only ask the server once a session exists; without one the answer is 401
  // and the root gate already owns the sign-in redirect.
  const me = useAdminMe(hasSession);

  if (isPending) return null;
  if (!hasSession) return <Redirect href="/(auth)/sign-in" />;
  if (me.isLoading) return <AdminShellSkeleton />;

  const refused =
    me.error instanceof ApiClientError && (me.error.status === 403 || me.error.status === 401);
  if (refused) return <Redirect href="/" />;

  if (!me.data) {
    return (
      <AdminShell title="Console">
        <EmptyState
          icon="cloud-offline-outline"
          title="Could not confirm your access"
          subtitle="The console could not reach the server. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void me.refetch()}
        />
      </AdminShell>
    );
  }

  return <>{children(me.data.role)}</>;
}

/** One step in the detail trail. The last crumb is the record, so it has no href. */
export type Crumb = { label: string; href?: string };

export type AdminShellProps = {
  /** Highlights the matching sidebar entry. Omitted on chrome-only states. */
  nav?: AdminNavKey;
  title: string;
  subtitle?: string;
  /**
   * False where the screen names itself in its own content, so the title is not
   * printed twice.
   */
  showTitle?: boolean;
  /** Primary actions for this screen, rendered at the top bar's right edge. */
  actions?: ReactNode;
  /** Filters and search. Pinned under the title, above the scrolling content. */
  toolbar?: ReactNode;
  /** Replaces the title block with a back affordance on detail screens. */
  onBack?: () => void;
  /**
   * Replaces the title/subtitle pair with a trail on a detail screen. A detail
   * route's own name ("Jack Nel Rebias") says nothing about where it sits, and
   * the title row printed it with the date underneath while the content below
   * printed both again. The trail says the one thing the title could not — the
   * list this record came out of — and the last crumb is the record itself.
   */
  breadcrumb?: Crumb[];
  children: ReactNode;
};

/** Console canvas. Sidebar plus a scrolling content column. */
export function AdminShell(props: AdminShellProps) {
  return (
    <ConsoleThemeProvider>
      <AdminShellInner {...props} />
    </ConsoleThemeProvider>
  );
}

function AdminShellInner({
  nav,
  title,
  subtitle,
  showTitle = true,
  actions,
  toolbar,
  onBack,
  breadcrumb,
  children,
}: AdminShellProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  // Narrow windows force the rail; above that the operator's own choice wins.
  const [collapsed, setCollapsed] = useState(false);
  const rail = width < RAIL_BREAKPOINT || collapsed;

  const hasTitleRow = showTitle || !!actions || !!toolbar || !!onBack || !!breadcrumb;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Sidebar
        active={nav}
        rail={rail}
        locked={width < RAIL_BREAKPOINT}
        onToggle={() => setCollapsed((c) => !c)}
      />

      <View style={styles.main}>
        <GlobalBar />
        {hasTitleRow ? (
          <TopBar
            title={showTitle ? title : undefined}
            subtitle={showTitle ? subtitle : undefined}
            actions={actions}
            toolbar={toolbar}
            onBack={onBack}
            breadcrumb={breadcrumb}
          />
        ) : null}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.contentColumn}>{children}</View>
        </ScrollView>
      </View>
    </View>
  );
}

function Sidebar({
  active,
  rail,
  locked,
  onToggle,
}: {
  active?: AdminNavKey;
  rail: boolean;
  /** The window is too narrow to expand; the toggle is hidden rather than dead. */
  locked: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { scheme, toggle } = useConsoleTheme();

  return (
    <View
      style={[
        styles.sidebar,
        {
          width: rail ? RAIL_WIDTH : SIDEBAR_WIDTH,
          backgroundColor: theme.surface,
          borderRightColor: theme.border,
        },
      ]}>
      <View style={[styles.brand, rail && styles.brandRail]}>
        <DropMark size={34} from={theme.brand} to={theme.brandStrong} />
        {rail ? null : (
          <>
            <View style={styles.brandText}>
              <ThemedText type="footnote" style={styles.brandName}>
                DONORNET
              </ThemedText>
              <ThemedText type="caption" color="textTertiary">
                Operations
              </ThemedText>
            </View>
            {locked ? null : (
              <Pressable
                onPress={onToggle}
                accessibilityRole="button"
                accessibilityLabel="Collapse the sidebar"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={({ hovered, pressed }) => [
                  styles.collapse,
                  hovered || pressed ? { backgroundColor: theme.surfaceSunken } : null,
                ]}>
                <Ionicons name="chevron-back" size={13} color={theme.textTertiary} />
                <Ionicons
                  name="chevron-back"
                  size={13}
                  color={theme.textTertiary}
                  style={styles.chevronOverlap}
                />
              </Pressable>
            )}
          </>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.navScroll}>
        {NAV_GROUPS.map((group, i) => (
          <View key={group.label ?? `group-${i}`} style={styles.navGroup}>
            {group.label && !rail ? (
              <ThemedText type="caption" color="textTertiary" style={styles.groupLabel}>
                {group.label.toUpperCase()}
              </ThemedText>
            ) : null}
            {group.items.map((item) => (
              <NavRow
                key={item.key}
                item={item}
                selected={item.key === active}
                rail={rail}
                onPress={() => router.replace(item.href as never)}
              />
            ))}
          </View>
        ))}
      </ScrollView>

      {rail ? null : <SidebarPromo />}

      <View style={[styles.sidebarFooter, { borderTopColor: theme.border }]}>
        <ThemeRow rail={rail} dark={scheme === 'dark'} onToggle={toggle} />
        {/* Staff land here instead of the donor home (see src/app/index.tsx),
            and most of them are donors too — so the way across is one press,
            not a URL to remember. Straight to the tab rather than via "/",
            which would bounce a staff account back into the console. */}
        <SidebarButton
          icon="phone-portrait-outline"
          label="Donor app"
          rail={rail}
          onPress={() => router.push('/(tabs)/home')}
        />
        <SidebarButton
          icon="log-out-outline"
          label="Sign out"
          rail={rail}
          onPress={() => {
            void authClient.signOut().then(() => router.replace('/'));
          }}
        />
      </View>
    </View>
  );
}

/**
 * The one piece of voice in otherwise functional chrome. It states the
 * product's purpose rather than promoting anything, which is why it carries no
 * action: a button here would compete with the navigation above it for no
 * errand.
 */
function SidebarPromo() {
  const theme = useTheme();

  return (
    <View style={[styles.promo, { backgroundColor: theme.brandSubtle }]} accessibilityRole="summary">
      <DropMark size={30} from={theme.brand} to={theme.brandStrong} />
      <View style={styles.promoText}>
        <ThemedText type="footnote" numberOfLines={1}>
          Better donors.
        </ThemedText>
        <ThemedText type="footnote" color="textSecondary" numberOfLines={1}>
          Healthier communities.
        </ThemedText>
      </View>
    </View>
  );
}

function ThemeRow({ rail, dark, onToggle }: { rail: boolean; dark: boolean; onToggle: () => void }) {
  const theme = useTheme();

  // On the rail there is no room for a switch, so the whole row becomes the
  // control and the icon carries the state — same behavior, one affordance.
  if (rail) {
    return (
      <SidebarButton
        icon={dark ? 'sunny-outline' : 'moon-outline'}
        label={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}
        rail
        onPress={onToggle}
      />
    );
  }

  return (
    <View style={styles.navRow}>
      <Ionicons name="moon-outline" size={18} color={theme.textSecondary} />
      <ThemedText type="subhead" color="textSecondary" style={styles.navLabel} numberOfLines={1}>
        Dark theme
      </ThemedText>
      <Switch
        value={dark}
        onValueChange={onToggle}
        accessibilityLabel="Dark theme"
        trackColor={{ false: theme.borderStrong, true: theme.brand }}
        thumbColor={theme.surface}
        // react-native-web keeps a separate "on" thumb color and falls back to
        // its own default green when it isn't given one.
        {...({ activeThumbColor: theme.surface } as object)}
        style={styles.switch}
      />
    </View>
  );
}

function NavRow({
  item,
  selected,
  rail,
  onPress,
}: {
  item: NavItem;
  selected: boolean;
  rail: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  // Selection is carried by fill, by weight, and by the glyph switching from
  // outline to solid, and reported to assistive tech through `selected` — never
  // by color alone.
  const fg = selected ? theme.brand : theme.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityState={{ selected }}
      accessibilityLabel={item.label}
      style={({ hovered, pressed }) => [
        styles.navRow,
        rail && styles.navRowRail,
        selected ? { backgroundColor: theme.brandSubtle } : null,
        !selected && (hovered || pressed) ? { backgroundColor: theme.surfaceSunken } : null,
      ]}>
      <Ionicons name={selected ? item.iconActive : item.icon} size={19} color={fg} />
      {rail ? null : (
        <ThemedText
          type="subhead"
          style={[
            styles.navLabel,
            { color: selected ? theme.brand : theme.text, fontWeight: selected ? '600' : '500' },
          ]}
          numberOfLines={1}>
          {item.label}
        </ThemedText>
      )}
    </Pressable>
  );
}

function SidebarButton({
  icon,
  label,
  rail,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  rail: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ hovered, pressed }) => [
        styles.navRow,
        rail && styles.navRowRail,
        hovered || pressed ? { backgroundColor: theme.surfaceSunken } : null,
      ]}>
      <Ionicons name={icon} size={18} color={theme.textSecondary} />
      {rail ? null : (
        <ThemedText type="subhead" color="textSecondary" style={styles.navLabel} numberOfLines={1}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

/**
 * Search, alerts, and identity — the row that is the same on every console
 * screen. Identity comes from the session rather than `/api/admin/me`, which
 * returns only the role: the name is already on the client, and a second round
 * trip to print it would be a request for data we hold.
 */
function GlobalBar() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { data: session } = authClient.useSession();
  const me = useAdminMe();

  const name = session?.user?.name?.trim() || session?.user?.email || 'Signed in';
  const role = me.data?.role ? titleCase(me.data.role) : 'Staff';

  return (
    <View
      style={[
        styles.globalBar,
        { backgroundColor: theme.surface, borderBottomColor: theme.border },
      ]}>
      <View style={styles.globalInner}>
        {width >= SEARCH_BREAKPOINT ? <ConsoleSearch /> : <View style={styles.flex} />}

        <View style={styles.identity}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            style={({ hovered, pressed }) => [
              styles.iconButton,
              hovered || pressed ? { backgroundColor: theme.surfaceSunken } : null,
            ]}>
            <Ionicons name="notifications-outline" size={20} color={theme.textSecondary} />
          </Pressable>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <View style={styles.account} accessibilityRole="summary">
            <View style={[styles.avatar, { backgroundColor: theme.infoSubtle }]}>
              <ThemedText type="footnote" style={{ color: theme.info }}>
                {initials(name)}
              </ThemedText>
            </View>
            <View style={styles.accountText}>
              <ThemedText type="footnote" numberOfLines={1}>
                {name}
              </ThemedText>
              <ThemedText type="caption" color="textTertiary" numberOfLines={1}>
                {role}
              </ThemedText>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * Presentational for now, and labelled so: the console has no cross-area search
 * endpoint, and a box that silently does nothing when typed into is worse than
 * one that says what it is waiting for. `editable={false}` rather than
 * `disabled`, so it never takes focus a keyboard user then has to escape.
 */
function ConsoleSearch() {
  const theme = useTheme();

  return (
    <View
      style={[styles.search, { backgroundColor: theme.surfaceSunken, borderColor: theme.border }]}>
      <Ionicons name="search-outline" size={18} color={theme.textTertiary} />
      <TextInput
        editable={false}
        placeholder="Search requests, donors, or centers..."
        placeholderTextColor={theme.textTertiary}
        accessibilityLabel="Search — not yet available in this release"
        style={[styles.searchInput, { color: theme.text }]}
      />
      <View style={[styles.kbd, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ThemedText type="caption" color="textTertiary">
          ⌘ K
        </ThemedText>
      </View>
    </View>
  );
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function TopBar({
  title,
  subtitle,
  actions,
  toolbar,
  onBack,
  breadcrumb,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  toolbar?: ReactNode;
  onBack?: () => void;
  breadcrumb?: Crumb[];
}) {
  const theme = useTheme();

  return (
    <View
      style={[styles.topBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <View style={styles.topBarInner}>
        {title || onBack || actions || breadcrumb ? (
          <View style={styles.titleRow}>
            {onBack ? (
              <Pressable
                onPress={onBack}
                accessibilityRole="button"
                accessibilityLabel="Back"
                style={({ hovered, pressed }) => [
                  styles.backButton,
                  { borderColor: theme.border },
                  hovered || pressed ? { backgroundColor: theme.surfaceSunken } : null,
                ]}>
                <Ionicons name="chevron-back" size={18} color={theme.text} />
              </Pressable>
            ) : null}
            {breadcrumb ? (
              <Breadcrumb crumbs={breadcrumb} />
            ) : (
            <View style={styles.titleText}>
              {title ? (
                <ThemedText type="title2" numberOfLines={1}>
                  {title}
                </ThemedText>
              ) : null}
              {subtitle ? (
                <ThemedText type="footnote" color="textSecondary" numberOfLines={2}>
                  {subtitle}
                </ThemedText>
              ) : null}
            </View>
            )}
            {actions ? <View style={styles.actions}>{actions}</View> : null}
          </View>
        ) : null}
        {toolbar ? <View style={styles.toolbarSlot}>{toolbar}</View> : null}
      </View>
    </View>
  );
}

/**
 * The trail of lists a detail record sits under. Every crumb but the last is a
 * link back to its list; the last is the record and is marked as the current
 * page rather than rendered as a link that goes nowhere.
 */
function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <View
      style={styles.crumbs}
      accessibilityLabel="Breadcrumb"
      {...({ role: 'navigation' } as object)}>
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1;
        return (
          <View key={`${crumb.label}-${i}`} style={styles.crumbItem}>
            {i > 0 ? (
              <Ionicons name="chevron-forward" size={15} color={theme.textTertiary} />
            ) : null}
            {last || !crumb.href ? (
              <ThemedText
                type="headline"
                numberOfLines={1}
                accessibilityRole="header"
                {...({ 'aria-current': 'page' } as object)}>
                {crumb.label}
              </ThemedText>
            ) : (
              <Pressable
                onPress={() => router.replace(crumb.href as never)}
                accessibilityRole="link"
                accessibilityLabel={`Back to ${crumb.label}`}
                style={({ hovered, pressed }) => [
                  styles.crumbLink,
                  hovered || pressed ? { backgroundColor: theme.surfaceSunken } : null,
                ]}>
                <ThemedText type="headline" color="textSecondary" numberOfLines={1}>
                  {crumb.label}
                </ThemedText>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** Shaped like the eventual chrome, not a full-screen spinner. */
export function AdminShellSkeleton() {
  return (
    <AdminShell title="Console">
      <Skeleton height={92} radius={Radius.lg} />
      <Skeleton height={320} radius={Radius.lg} />
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  main: { flex: 1, minWidth: 0 },
  flex: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing['4xl'] },
  // Centred, and matched by `topBarInner`, so the title, the filters and the
  // table share one left edge instead of the capped column stranding its slack
  // entirely on the right of a wide monitor.
  contentColumn: { width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center', gap: Spacing.base },

  sidebar: { borderRightWidth: StyleSheet.hairlineWidth },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  brandRail: { justifyContent: 'center', paddingHorizontal: 0 },
  brandText: { flex: 1, minWidth: 0 },
  brandName: { fontWeight: '800', letterSpacing: 0.8 },
  collapse: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronOverlap: { marginLeft: -7 },

  navScroll: { paddingBottom: Spacing.base, gap: Spacing.lg },
  navGroup: { gap: 2, paddingHorizontal: Spacing.md },
  groupLabel: { letterSpacing: 0.8, paddingHorizontal: Spacing.md, paddingBottom: Spacing.xs },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
  },
  navRowRail: { justifyContent: 'center', paddingHorizontal: 0 },
  navLabel: { flex: 1, minWidth: 0 },
  switch: { transform: [{ scale: 0.8 }] },

  promo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    padding: Spacing.base,
    borderRadius: Radius.lg,
  },
  promoText: { flex: 1, minWidth: 0 },

  sidebarFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: 2,
  },

  globalBar: { borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 30 },
  globalInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.base,
    width: '100%',
    maxWidth: CONTENT_MAX,
    alignSelf: 'center',
  },
  search: {
    flex: 1,
    // Grows into the space the identity cluster doesn't use, but capped: a
    // search field stretched the full width of a monitor leaves its placeholder
    // floating in the middle of nothing and gives the eye no edge to start at.
    maxWidth: 720,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    height: 44,
    paddingHorizontal: Spacing.base,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    // react-native-web gives inputs a focus ring the pill already expresses.
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as never } : null),
  },
  kbd: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // `auto` margin, not `justifyContent`: the search field is the flexible item
  // in this row, so it would absorb the free space before any distribution
  // could push the account to the edge.
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base, marginLeft: 'auto' },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { width: StyleSheet.hairlineWidth, height: 28 },
  account: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountText: { minWidth: 0 },

  // `overflow: visible` and a stacking context above the scroll area: a
  // react-native-web View clips its children by default, which would cut a
  // toolbar dropdown off at the top bar's bottom edge.
  topBar: { borderBottomWidth: StyleSheet.hairlineWidth, overflow: 'visible', zIndex: 20 },
  topBarInner: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.base,
    width: '100%',
    maxWidth: CONTENT_MAX,
    alignSelf: 'center',
    overflow: 'visible',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  titleText: { flex: 1, minWidth: 0, gap: 2 },
  crumbs: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  crumbItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, minWidth: 0 },
  crumbLink: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    marginHorizontal: -Spacing.sm,
    borderRadius: Radius.sm,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarSlot: { width: '100%', overflow: 'visible' },
});
