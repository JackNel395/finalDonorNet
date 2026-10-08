/**
 * A right-edge slide-over panel for console forms.
 *
 * `PATTERNS.md` rules out inventing a centered web modal, and it is right to:
 * a box floating in the middle of the viewport hides the thing the operator was
 * reading and gives no account of where it came from. A slide-over is the other
 * shape. It is anchored to an edge, it leaves the list it was opened from
 * visible beside it, and it reads as a layer over this page rather than as a
 * detached window — which is exactly the case for creating a record while
 * staying on the table that lists them.
 *
 * It is here rather than in `src/components/ui` because that barrel is imported
 * by every donor screen and an edge drawer is console furniture: the donor app
 * navigates between routes and confirms with `ConfirmSheet`. If a second
 * surface outside this directory ever needs one, that is when it moves.
 *
 * Built on `Modal` for the same reason `ConfirmSheet` is: it supplies the
 * overlay, the focus trap, and focus restoration on dismiss. Dismissal is a
 * *request* — the caller decides whether a backdrop press or Escape should
 * close a half-filled form or ask first.
 *
 * Web-only, like every module in this directory.
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';

const EASE_OUT = Easing.out(Easing.cubic);
const EASE_IN = Easing.in(Easing.cubic);

/** Below this the panel takes the whole viewport; there is no list to keep beside it. */
const FULL_WIDTH_BELOW = 640;

export function Drawer({
  visible,
  title,
  description,
  width = 520,
  onRequestClose,
  footer,
  children,
}: {
  visible: boolean;
  title: string;
  /** One line on what the panel is for. Also the dialog's accessible description. */
  description?: string;
  /** Desktop width. Clamped to the viewport, and ignored on narrow screens. */
  width?: number;
  /**
   * A backdrop press, the close button, or Escape. Named a request because the
   * caller may need to confirm first — a form with unsaved input should not
   * vanish because a click landed outside it.
   */
  onRequestClose: () => void;
  /** Pinned below the scroll area, so the primary action never scrolls away. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { width: windowWidth } = useWindowDimensions();

  const panelWidth = windowWidth < FULL_WIDTH_BELOW ? windowWidth : Math.min(width, windowWidth);

  // Stay mounted until the exit animation finishes, the same two-step
  // `ConfirmSheet` uses: mount during render on show, unmount from the
  // animation's completion callback.
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0); // 0 offscreen → 1 open

  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      progress.value = withTiming(1, { duration: reduceMotion ? 0 : 260, easing: EASE_OUT });
    } else {
      progress.value = withTiming(
        0,
        { duration: reduceMotion ? 0 : 200, easing: EASE_IN },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
    }
  }, [visible, reduceMotion, progress]);

  // `Modal` closes itself on Escape on web, but that is an implementation
  // detail of the host rather than a documented prop, and Escape has to work.
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const doc = globalThis.document;
    if (!doc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onRequestClose();
    };
    doc.addEventListener('keydown', onKey);
    return () => doc.removeEventListener('keydown', onKey);
  }, [visible, onRequestClose]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - progress.value) * panelWidth }],
  }));

  if (!mounted) return null;

  return (
    <Modal
      transparent
      visible={mounted}
      animationType="none"
      onRequestClose={onRequestClose}
      // `Modal` already renders the dialog element and marks it modal; what it
      // cannot know is what this one is called. The name goes on that element
      // rather than on a second `role="dialog"` of our own, which would nest
      // one dialog inside another.
      {...({ 'aria-label': title } as object)}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onRequestClose}
          // Routed through `onRequestClose` like every other dismissal, so a
          // form with unsaved input still gets to ask first.
          accessibilityLabel={`Dismiss ${title}`}
        />
      </Animated.View>

      <View style={styles.wrap} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.panel,
            { width: panelWidth, backgroundColor: theme.background, borderColor: theme.border },
            Shadow.lg,
            panelStyle,
          ]}>
          <View
            style={[
              styles.head,
              { backgroundColor: theme.surface, borderBottomColor: theme.border },
            ]}>
            <View style={styles.headText}>
              <ThemedText type="title2">{title}</ThemedText>
              {description ? (
                <ThemedText type="footnote" color="textSecondary">
                  {description}
                </ThemedText>
              ) : null}
            </View>

            <Pressable
              onPress={onRequestClose}
              accessibilityRole="button"
              accessibilityLabel={`Close ${title}`}
              hitSlop={6}
              style={({ hovered, pressed }) => [
                styles.close,
                { borderColor: theme.border },
                hovered || pressed ? { backgroundColor: theme.surfaceSunken } : null,
              ]}>
              <Ionicons name="close" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>

          {footer ? (
            <View
              style={[
                styles.footer,
                {
                  backgroundColor: theme.surface,
                  borderTopColor: theme.border,
                  paddingBottom: Spacing.base + insets.bottom,
                },
              ]}>
              {footer}
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(16, 18, 32, 0.45)' },
  wrap: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  panel: {
    height: '100%',
    maxWidth: '100%',
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.base,
    padding: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  close: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The form's own content scrolls; the header and the actions do not.
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.lg, gap: Spacing.lg },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
