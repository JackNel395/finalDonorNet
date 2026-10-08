import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Radius, Spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

type Slide = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    icon: 'water',
    title: 'Every drop\nsaves a life',
    body: 'One donation can help up to three people. DonorNet connects you to the moments where you matter most.',
  },
  {
    icon: 'pulse',
    title: 'Respond to\nemergencies',
    body: 'See compatible, nearby blood requests in real time and answer the ones you can reach.',
  },
  {
    icon: 'ribbon',
    title: 'Track your\nimpact',
    body: 'Your donation history, eligibility, and the lives you touch — all in one calm, private place.',
  },
];

export default function Onboarding() {
  const router = useRouter();
  const theme = useTheme();
  const { completeOnboarding } = useAppStore();
  const [index, setIndex] = useState(0);
  const scrollX = useSharedValue(0);
  const scrollRef = useRef<Animated.ScrollView>(null);
  const { width: winWidth } = useWindowDimensions();

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    scrollX.value = x;
    const next = Math.round(x / winWidth);
    if (next !== index) {
      setIndex(next);
      haptics.selection();
    }
  };

  const isLast = index === SLIDES.length - 1;

  const advance = async () => {
    if (isLast) {
      await completeOnboarding();
      router.replace('/(auth)/sign-in');
      return;
    }
    scrollRef.current?.scrollTo({ x: (index + 1) * winWidth, animated: true });
  };

  const skip = async () => {
    await completeOnboarding();
    router.replace('/(auth)/sign-in');
  };

  return (
    <View style={styles.container}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.brandDeep }]} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.top}>
          <ThemedText type="headline" style={styles.brand}>
            DonorNet
          </ThemedText>
          {!isLast && (
            <PressableScale
              onPress={skip}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel="Skip onboarding"
              hitSlop={8}
              style={styles.skipBtn}>
              <ThemedText type="callout" style={styles.skip}>
                Skip
              </ThemedText>
            </PressableScale>
          )}
        </View>

        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={styles.scroll}>
          {SLIDES.map((slide) => (
            <View key={slide.title} style={[styles.slide, { width: winWidth }]}>
              <View style={styles.iconWrap}>
                <Ionicons name={slide.icon} size={64} color="#FFFFFF" />
              </View>
              <ThemedText type="display" style={styles.title}>
                {slide.title}
              </ThemedText>
              <ThemedText type="body" style={styles.body}>
                {slide.body}
              </ThemedText>
            </View>
          ))}
        </Animated.ScrollView>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {SLIDES.map((s, i) => (
              <Dot key={s.title} active={i === index} />
            ))}
          </View>
          <Button
            label={isLast ? 'Get started' : 'Continue'}
            onPress={advance}
            fullWidth
            size="lg"
            variant="inverse"
            style={styles.cta}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

function Dot({ active }: { active: boolean }) {
  const style = useAnimatedStyle(() => ({
    width: withTiming(active ? 24 : 8, { duration: 220 }),
    opacity: withTiming(active ? 1 : 0.4, { duration: 220 }),
  }));
  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
  },
  brand: { color: '#FFFFFF', letterSpacing: 0.5 },
  skipBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.sm },
  skip: { color: 'rgba(255,255,255,0.85)' },
  scroll: { flex: 1 },
  slide: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
  },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  title: { color: '#FFFFFF', fontSize: 40, lineHeight: 44 },
  body: { color: 'rgba(255,255,255,0.9)', maxWidth: 340 },
  footer: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.xl,
    paddingBottom: Spacing.base,
  },
  dots: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  dot: { height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  cta: {},
});
