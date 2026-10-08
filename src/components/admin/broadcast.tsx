/**
 * /admin/broadcast — send a push notification to a defined segment of donors.
 *
 * This writes to donors' lock screens, and a push cannot be recalled. So the
 * flow is deliberately three steps, not one:
 *
 *   form → "Check reach" (resolves the count, sends nothing) → ConfirmPanel
 *   naming that count → send.
 *
 * Several guards are built into the shape of the screen rather than left to
 * copy:
 *
 *   - Send is **disabled until a preview has been run** for the current
 *     segment. Changing any filter clears the preview, so staff can never
 *     confirm a count that belongs to a different audience.
 *   - An unfiltered segment reaches every donor and requires an explicit
 *     acknowledgement, matching the server's `confirmAll`.
 *   - The word "eligible" is never used. The interval filter is named for what
 *     it measures — donation spacing — because the app makes no medical
 *     judgement about a donor.
 *
 * The screen is laid out as a composer: numbered steps down the left, and a
 * rail on the right holding the lock-screen preview and a readiness panel. The
 * rail is not decoration. Every other console screen reads data that already
 * exists; this one *writes*, irreversibly, to people's phones, and the two
 * questions a sender needs answered continuously — what will this look like,
 * and what is still missing — do not belong at the bottom of a scroll.
 *
 * Web-only; see broadcast.native.tsx.
 */
import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ConfirmPanel } from '@/components/admin/confirm-panel';
import { BloodTypeFilter } from '@/components/admin/blood-type-filter';
import { LockScreenPreview } from '@/components/admin/lock-screen-preview';
import { AdminGate, AdminShell } from '@/components/admin/shell';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Input, StatTile, useToast } from '@/components/ui';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useBroadcastPreview, useSendBroadcast } from '@/hooks/api/admin/use-broadcast';
import { useTheme } from '@/hooks/use-theme';
import type { BroadcastSegmentBody } from '@/types/api';
import type { BloodType } from '@/types/domain';

/** Mirrors the server's caps, which are sized to what a lock screen shows. */
const MAX_TITLE = 65;
const MAX_BODY = 240;

/** The copy the preview shows before anything is typed, and the field placeholders. */
const EXAMPLE_TITLE = 'O-negative donors needed in Cebu City';
const EXAMPLE_BODY = 'Vicente Sotto Memorial is short on O-negative. Booking takes a minute.';

/** Below this the rail drops under the form rather than squeezing both. */
const RAIL_BREAKPOINT = 1240;
const RAIL_WIDTH = 380;

type IntervalChoice = 'any' | 'elapsed';

export function AdminBroadcast() {
  return <AdminGate>{() => <BroadcastScreen />}</AdminGate>;
}

function BroadcastScreen() {
  const { width } = useWindowDimensions();
  const toast = useToast();
  const preview = useBroadcastPreview();
  const send = useSendBroadcast();

  const [bloodType, setBloodType] = useState<BloodType | null>(null);
  const [city, setCity] = useState('');
  const [interval, setInterval] = useState<IntervalChoice>('any');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<{ title?: string; body?: string }>({});
  const [acknowledgedAll, setAcknowledgedAll] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const stacked = width < RAIL_BREAKPOINT;

  const segment: BroadcastSegmentBody = {
    bloodType: bloodType ?? undefined,
    city: city.trim() || undefined,
    intervalElapsed: interval === 'elapsed',
  };

  const isEveryone = !segment.bloodType && !segment.city && !segment.intervalElapsed;

  /**
   * Any change to the audience invalidates a resolved count, so the preview is
   * discarded rather than left on screen next to a different segment.
   */
  const changeSegment = (apply: () => void) => {
    apply();
    preview.reset();
    setAcknowledgedAll(false);
  };

  const resolved = preview.data;
  const busy = preview.isPending || send.isPending;

  const validateCopy = () => {
    const next: { title?: string; body?: string } = {};
    if (!title.trim()) next.title = 'A title is required.';
    else if (title.trim().length > MAX_TITLE) next.title = `Keep the title to ${MAX_TITLE} characters.`;
    if (!body.trim()) next.body = 'A message is required.';
    else if (body.trim().length > MAX_BODY) next.body = `Keep the message to ${MAX_BODY} characters.`;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const runPreview = () => {
    preview.mutate(segment, {
      onError: (err) => toast.show(err.message, 'danger'),
    });
  };

  const confirmSend = () => {
    setConfirming(false);
    send.mutate(
      { segment, title: title.trim(), body: body.trim(), confirmAll: isEveryone || undefined },
      {
        onSuccess: (result) => {
          toast.show(
            `Sent to ${result.recipientCount} donor${result.recipientCount === 1 ? '' : 's'} across ${result.deviceCount} device${result.deviceCount === 1 ? '' : 's'}.`,
            'success',
          );
          setTitle('');
          setBody('');
          setErrors({});
          preview.reset();
          setAcknowledgedAll(false);
        },
        // The server's message is the specific one — a 409 means the segment
        // resolved to nobody, a 400 names the missing acknowledgement.
        onError: (err) => toast.show(err.message, 'danger'),
      },
    );
  };

  const canSend =
    !!resolved && resolved.recipientCount > 0 && (!isEveryone || acknowledgedAll) && !busy;

  /**
   * Always leads with the noun. Building the phrase from optional fragments
   * produced subject-less copy whenever the blood type was unset — "this would
   * reach whose donation interval has elapsed" — so "donors" is the base and
   * the filters qualify it.
   */
  const describeSegment = () => {
    if (isEveryone) return 'every donor with a registered device';
    const parts = [segment.bloodType ? `${segment.bloodType} donors` : 'donors'];
    if (segment.city) parts.push(`in ${segment.city}`);
    if (segment.intervalElapsed) parts.push('whose donation interval has elapsed');
    return parts.join(' ');
  };

  // The three preconditions for sending, in the order the form asks for them.
  // The step rail, the readiness panel, and the send button all read from these
  // rather than each deciding for itself what "ready" means.
  const audienceSettled = !isEveryone || acknowledgedAll;
  const messageSettled =
    !!title.trim() &&
    !!body.trim() &&
    title.trim().length <= MAX_TITLE &&
    body.trim().length <= MAX_BODY;
  const reachSettled = !!resolved && resolved.recipientCount > 0;

  const currentStep = !audienceSettled ? 0 : !messageSettled ? 1 : !reachSettled ? 2 : 3;

  return (
    <AdminShell
      nav="broadcast"
      title="Broadcast"
      subtitle="Send a push notification to a group of donors. A push cannot be recalled, so check the reach first."
      showTitle={false}>
      <PageHeader />

      <StepRail
        steps={['Audience', 'Message', 'Reach', 'Send']}
        current={currentStep}
        done={[audienceSettled, messageSettled, reachSettled, false]}
      />

      <View style={[styles.columns, stacked && styles.columnsStacked]}>
        <View style={styles.formColumn}>
          {/* --- 1. Audience --- */}
          <SectionCard
            index={1}
            title="Audience"
            subtitle="Choose who this reaches. Leave everything unset to reach every donor, which has to be acknowledged separately."
            icon="locate-outline"
            tint="brand">
            <View style={styles.fieldRow}>
              <BloodTypeFilter
                value={bloodType}
                onChange={(v) => changeSegment(() => setBloodType(v))}
                variant="field"
                icon="water-outline"
              />
              <View style={styles.field}>
                <Input
                  label="City"
                  icon="location-outline"
                  placeholder="Any city"
                  value={city}
                  onChangeText={(v) => changeSegment(() => setCity(v))}
                  autoCapitalize="words"
                  editable={!busy}
                />
              </View>
            </View>

            <View style={styles.stack}>
              <ThemedText type="subhead" color="textSecondary" style={styles.fieldLabel}>
                Donation interval
              </ThemedText>
              <View style={styles.choiceRow} accessibilityRole="radiogroup">
                <ChoiceCard
                  label="Any donor"
                  description="Everyone matching the filters above"
                  selected={interval === 'any'}
                  disabled={busy}
                  onPress={() => changeSegment(() => setInterval('any'))}
                />
                <ChoiceCard
                  label="Interval elapsed"
                  description="90 days since last recorded donation"
                  selected={interval === 'elapsed'}
                  disabled={busy}
                  onPress={() => changeSegment(() => setInterval('elapsed'))}
                />
              </View>
              {/* Deliberately not the word "eligible": this measures spacing
                  between donations, not whether anyone is medically fit. */}
              <Callout icon="information-circle" tone="info">
                &ldquo;Interval elapsed&rdquo; means the 90-day gap since their last recorded
                donation has passed. It is not a medical judgement, and the message must not suggest
                one.
              </Callout>
            </View>
          </SectionCard>

          {/* --- 2. Message --- */}
          <SectionCard
            index={2}
            title="Message"
            subtitle="Say what is needed and what the donor can do. Keep it calm and specific."
            icon="chatbubble-ellipses-outline"
            tint="info">
            <Input
              label="Title"
              placeholder={EXAMPLE_TITLE}
              value={title}
              onChangeText={(v) => {
                setTitle(v);
                if (errors.title) setErrors((e) => ({ ...e, title: undefined }));
              }}
              error={errors.title}
              counter={`${title.trim().length} / ${MAX_TITLE}`}
              hint="Longer titles are cut off on a lock screen."
              editable={!busy}
            />
            <Input
              label="Message"
              placeholder={EXAMPLE_BODY}
              value={body}
              onChangeText={(v) => {
                setBody(v);
                if (errors.body) setErrors((e) => ({ ...e, body: undefined }));
              }}
              error={errors.body}
              counter={`${body.trim().length} / ${MAX_BODY}`}
              hint="Tapping the notification opens the home feed."
              multiline
              style={styles.textArea}
              editable={!busy}
            />
          </SectionCard>

          {/* --- 3. Reach --- */}
          <SectionCard
            index={3}
            title="Reach"
            subtitle="Resolve how many donors this segment matches before sending. Nothing is sent by checking."
            icon="people-outline"
            tint="accent">
            {preview.isError ? (
              <Callout icon="cloud-offline" tone="danger">
                Could not resolve the audience, so nothing was sent. Check your connection and try
                again.
              </Callout>
            ) : null}

            {resolved ? (
              <>
                <View style={styles.tiles}>
                  <View style={styles.tile}>
                    <StatTile
                      label="Donors"
                      value={String(resolved.recipientCount)}
                      icon="people-outline"
                      tint={resolved.recipientCount > 0 ? 'brand' : 'neutral'}
                    />
                  </View>
                  <View style={styles.tile}>
                    <StatTile
                      label="Devices"
                      value={String(resolved.deviceCount)}
                      icon="phone-portrait-outline"
                    />
                  </View>
                </View>

                <ThemedText type="body" color="textSecondary">
                  This would reach {describeSegment()}.
                </ThemedText>

                {resolved.recipientCount === 0 ? (
                  <Callout icon="alert-circle" tone="warning">
                    No donors with a registered device match this audience, so there is nothing to
                    send. Widen a filter and check again.
                  </Callout>
                ) : null}

                {isEveryone && resolved.recipientCount > 0 ? (
                  <AckPanel>
                    <ThemedText type="headline">
                      This has no filters and reaches every donor
                    </ThemedText>
                    <ThemedText type="body" color="textSecondary">
                      {resolved.recipientCount} donors would get this notification. If that is not
                      what you meant, add a blood type or a city above.
                    </ThemedText>
                    <View style={styles.actions}>
                      <Button
                        label={
                          acknowledgedAll
                            ? 'Sending to everyone is confirmed'
                            : 'I mean to reach every donor'
                        }
                        variant={acknowledgedAll ? 'secondary' : 'danger'}
                        icon={acknowledgedAll ? 'checkmark-circle' : undefined}
                        disabled={busy || acknowledgedAll}
                        onPress={() => setAcknowledgedAll(true)}
                      />
                    </View>
                  </AckPanel>
                ) : null}

                <View style={styles.actions}>
                  <Button
                    label="Check again"
                    variant="secondary"
                    icon="refresh-outline"
                    disabled={busy}
                    loading={preview.isPending}
                    onPress={runPreview}
                  />
                </View>
              </>
            ) : (
              <ReachPlaceholder
                busy={busy}
                loading={preview.isPending}
                onCheck={runPreview}
              />
            )}
          </SectionCard>
        </View>

        <View style={[styles.rail, stacked && styles.railStacked]}>
          <LockScreenPreview
            title={title}
            body={body}
            exampleTitle={EXAMPLE_TITLE}
            exampleBody={EXAMPLE_BODY}
          />

          <ReadyPanel
            rows={[
              {
                label: 'Audience',
                state: audienceSettled ? 'done' : 'attention',
                detail: audienceSettled
                  ? `${describeSegment().charAt(0).toUpperCase()}${describeSegment().slice(1)}.`
                  : 'No filters set: every donor. Needs separate acknowledgement.',
              },
              {
                label: 'Message',
                state: messageSettled ? 'done' : 'todo',
                detail: messageSettled
                  ? 'Title and message are set.'
                  : !title.trim() && !body.trim()
                    ? 'Title and message are empty.'
                    : !title.trim()
                      ? 'The title is empty.'
                      : !body.trim()
                        ? 'The message is empty.'
                        : 'Over the character limit.',
              },
              {
                label: 'Reach',
                // Resolved-but-empty is a problem to act on, not a step still
                // waiting its turn.
                state: reachSettled ? 'done' : resolved ? 'attention' : 'todo',
                detail: resolved
                  ? `${resolved.recipientCount} donor${resolved.recipientCount === 1 ? '' : 's'} on ${resolved.deviceCount} device${resolved.deviceCount === 1 ? '' : 's'}.`
                  : 'Not checked yet.',
              },
            ]}
            canSend={canSend}
            sending={send.isPending}
            // Reach comes first even though it is the last step: the
            // acknowledgement only becomes reachable once a preview has run, so
            // naming it before then would point at a control that is not there.
            blockedReason={
              !resolved
                ? 'Check the reach to enable sending.'
                : resolved.recipientCount === 0
                  ? 'This audience matches nobody with a registered device.'
                  : !audienceSettled
                    ? 'Acknowledge above that this reaches every donor.'
                    : !messageSettled
                      ? 'Write a title and a message.'
                      : undefined
            }
            onSend={() => {
              if (!validateCopy()) return;
              setConfirming(true);
            }}
          />
        </View>
      </View>

      <ConfirmPanel
        visible={confirming}
        destructive
        title={
          resolved
            ? `Send to ${resolved.recipientCount} donor${resolved.recipientCount === 1 ? '' : 's'}?`
            : 'Send this broadcast?'
        }
        message={
          resolved
            ? `This goes to ${describeSegment()} — ${resolved.deviceCount} device${resolved.deviceCount === 1 ? '' : 's'} — straight away, and cannot be recalled. It is recorded with your name and the exact wording.`
            : undefined
        }
        confirmLabel="Send it now"
        onConfirm={confirmSend}
        onCancel={() => setConfirming(false)}
      />
    </AdminShell>
  );
}

/**
 * Both of these are components rather than inline styles on the screen,
 * because `AdminShell` is what installs `ConsoleThemeProvider` — anything that
 * reads `useTheme()` in the component that *renders* the shell gets the donor
 * app's theme instead, and stays light while the console is dark.
 */
function AckPanel({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.ackPanel, { backgroundColor: theme.dangerSubtle, borderColor: theme.danger }]}>
      {children}
    </View>
  );
}

function ReachPlaceholder({
  busy,
  loading,
  onCheck,
}: {
  busy: boolean;
  loading: boolean;
  onCheck: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.reachEmpty, { borderColor: theme.borderStrong }]}>
      <View style={styles.reachCount}>
        <ThemedText type="display" color="textTertiary">
          —
        </ThemedText>
        <ThemedText type="footnote" color="textTertiary">
          donors matched
        </ThemedText>
      </View>
      <View style={[styles.reachDivider, { backgroundColor: theme.border }]} />
      <ThemedText type="footnote" color="textSecondary" style={styles.reachText}>
        Check the reach to enable sending. Changing the audience clears the result, so the number
        you confirm always matches who receives it.
      </ThemedText>
      <Button
        label="Check reach"
        variant="secondary"
        icon="people-outline"
        disabled={busy}
        loading={loading}
        onPress={onCheck}
      />
    </View>
  );
}

/**
 * The screen names itself in its own content rather than in the shell's top bar
 * (`showTitle={false}`), because the warning belongs beside the title and the
 * top bar's action slot is a row of buttons, not a notice.
 */
function PageHeader() {
  const theme = useTheme();

  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <View style={styles.breadcrumb} accessibilityRole="header">
          <ThemedText type="footnote" color="textTertiary">
            Broadcast
          </ThemedText>
          <Ionicons name="chevron-forward" size={12} color={theme.textTertiary} />
          <ThemedText type="footnote" color="textSecondary">
            New push notification
          </ThemedText>
        </View>
        <ThemedText type="display">Send a broadcast</ThemedText>
        <ThemedText type="body" color="textSecondary">
          Send a push notification to a group of donors. A push cannot be recalled, so check the
          reach first.
        </ThemedText>
      </View>

      {/* A persistent marker, not a status chip: it states the one fact that
          makes this screen different from every other in the console, and it is
          true the whole time the screen is open. `Badge` is an uppercase status
          pill for data rows, which is the wrong register for a caution. */}
      <View
        style={[
          styles.recallPill,
          { backgroundColor: theme.warningSubtle, borderColor: theme.warning },
        ]}
        accessibilityRole="alert">
        <Ionicons name="warning-outline" size={16} color={theme.warning} />
        <ThemedText type="footnote" style={{ color: theme.warning }}>
          Push notifications cannot be recalled
        </ThemedText>
      </View>
    </View>
  );
}

/** Where the sender is in the four-step flow, and what is already satisfied. */
function StepRail({
  steps,
  current,
  done,
}: {
  steps: string[];
  current: number;
  done: boolean[];
}) {
  const theme = useTheme();

  return (
    <View
      style={[styles.stepRail, { backgroundColor: theme.surface, borderColor: theme.border }]}
      accessibilityRole="list"
      accessibilityLabel={`Step ${current + 1} of ${steps.length}: ${steps[current]}`}>
      {steps.map((step, i) => {
        const isDone = done[i];
        const isCurrent = i === current;
        // State is carried by the glyph (a check vs. a number) and by the label
        // weight as well as by fill — never by color alone.
        const bg = isDone ? theme.success : isCurrent ? theme.brand : theme.surfaceSunken;
        const fg = isDone || isCurrent ? theme.onBrand : theme.textTertiary;

        return (
          <View key={step} style={styles.stepItem}>
            <View style={styles.step}>
              <View style={[styles.stepDot, { backgroundColor: bg }]}>
                {isDone ? (
                  <Ionicons name="checkmark" size={16} color={fg} />
                ) : (
                  <ThemedText type="footnote" style={{ color: fg, fontWeight: '700' }}>
                    {i + 1}
                  </ThemedText>
                )}
              </View>
              <ThemedText
                type="subhead"
                style={{
                  color: isCurrent ? theme.text : theme.textSecondary,
                  fontWeight: isCurrent ? '700' : '500',
                }}
                numberOfLines={1}>
                {step}
              </ThemedText>
            </View>
            {i < steps.length - 1 ? (
              <View style={[styles.stepLine, { backgroundColor: theme.border }]} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * One numbered step of the composer. The tint is `brand`, `info` or `accent` —
 * never a status color, which on this screen has to stay reserved for what the
 * send actually resolves to.
 */
function SectionCard({
  index,
  title,
  subtitle,
  icon,
  tint,
  children,
}: {
  index: number;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: 'brand' | 'info' | 'accent';
  children: ReactNode;
}) {
  const theme = useTheme();
  const subtleKey = `${tint}Subtle` as ThemeColor;

  return (
    // `overflow: visible` here and on the body: a react-native-web View clips
    // its children, which cut the Type menu off at the card's bottom edge. The
    // descending z-index then keeps an earlier section above a later one, so a
    // menu opened in section 1 is not painted over by section 2.
    <Card padding={0} radius="lg" style={[styles.sectionCard, { zIndex: 10 - index }]}>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionNumber, { backgroundColor: theme.brandDeep }]}>
          <ThemedText type="footnote" style={{ color: theme.onColor, fontWeight: '700' }}>
            {index}
          </ThemedText>
        </View>
        <View style={styles.sectionText}>
          <ThemedText type="title2">{title}</ThemedText>
          <ThemedText type="footnote" color="textSecondary">
            {subtitle}
          </ThemedText>
        </View>
        <View
          style={[styles.sectionIcon, { backgroundColor: theme[subtleKey] }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <Ionicons name={icon} size={20} color={theme[tint]} />
        </View>
      </View>
      <View style={[styles.sectionDivider, { backgroundColor: theme.border }]} />
      <View style={styles.sectionBody}>{children}</View>
    </Card>
  );
}

/** A radio presented as a card, so the choice and its consequence read together. */
function ChoiceCard({
  label,
  description,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      accessibilityLabel={`${label}. ${description}`}
      style={({ hovered, pressed }) => [
        styles.choice,
        {
          backgroundColor: selected ? theme.brandSubtle : theme.surface,
          borderColor: selected
            ? theme.brand
            : hovered || pressed
              ? theme.borderStrong
              : theme.border,
        },
      ]}>
      <View
        style={[
          styles.radio,
          { borderColor: selected ? theme.brand : theme.borderStrong },
        ]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: theme.brand }]} /> : null}
      </View>
      <View style={styles.choiceText}>
        <ThemedText type="bodyStrong" numberOfLines={1}>
          {label}
        </ThemedText>
        <ThemedText type="footnote" color="textSecondary">
          {description}
        </ThemedText>
      </View>
    </Pressable>
  );
}

/** A tinted note inside a section. Always icon plus words, never tint alone. */
function Callout({
  icon,
  tone,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: 'info' | 'warning' | 'danger';
  children: ReactNode;
}) {
  const theme = useTheme();
  const subtleKey = `${tone}Subtle` as ThemeColor;

  return (
    <View style={[styles.callout, { backgroundColor: theme[subtleKey] }]}>
      <Ionicons name={icon} size={16} color={theme[tone]} style={styles.calloutIcon} />
      <ThemedText type="footnote" color="textSecondary" style={styles.calloutText}>
        {children}
      </ThemedText>
    </View>
  );
}

type ReadyRow = { label: string; state: 'done' | 'attention' | 'todo'; detail: string };

/** What is still missing, and the send itself — the rail's second half. */
function ReadyPanel({
  rows,
  canSend,
  sending,
  blockedReason,
  onSend,
}: {
  rows: ReadyRow[];
  canSend: boolean;
  sending: boolean;
  blockedReason?: string;
  onSend: () => void;
}) {
  const theme = useTheme();

  const ICON: Record<ReadyRow['state'], { name: keyof typeof Ionicons.glyphMap; color: ThemeColor }> =
    {
      done: { name: 'checkmark-circle', color: 'success' },
      attention: { name: 'warning', color: 'warning' },
      todo: { name: 'ellipse-outline', color: 'textTertiary' },
    };

  return (
    <View
      style={[styles.readyPanel, { backgroundColor: theme.brandSubtle, borderColor: theme.brand }]}
      accessibilityRole="summary">
      <ThemedText type="headline">Ready to send?</ThemedText>

      <View style={styles.readyRows}>
        {rows.map((row) => (
          <View key={row.label} style={styles.readyRow}>
            <Ionicons
              name={ICON[row.state].name}
              size={18}
              color={theme[ICON[row.state].color]}
              style={styles.readyIcon}
            />
            <View style={styles.readyText}>
              <ThemedText type="subhead">{row.label}</ThemedText>
              <ThemedText type="footnote" color="textSecondary">
                {row.detail}
              </ThemedText>
            </View>
          </View>
        ))}
      </View>

      <Button
        label="Send push notification"
        icon={canSend ? 'send' : 'lock-closed'}
        fullWidth
        disabled={!canSend}
        loading={sending}
        onPress={onSend}
      />
      {blockedReason ? (
        <ThemedText type="footnote" color="textTertiary" style={styles.readyFoot}>
          {blockedReason}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: Spacing.base },
  headerText: { flex: 1, minWidth: 320, gap: Spacing.xs },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  recallPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: 1,
  },

  stepRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
    padding: Spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
  },
  stepItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.base, minWidth: 0 },
  step: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minWidth: 0 },
  stepDot: { width: 28, height: 28, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  stepLine: { flex: 1, height: StyleSheet.hairlineWidth, minWidth: Spacing.base },

  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.base, overflow: 'visible' },
  columnsStacked: { flexDirection: 'column' },
  formColumn: { flex: 1, minWidth: 0, gap: Spacing.base, overflow: 'visible' },
  rail: { width: RAIL_WIDTH, gap: Spacing.base },
  railStacked: { width: '100%' },

  sectionCard: { overflow: 'visible' },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  sectionNumber: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionText: { flex: 1, minWidth: 0, gap: 2 },
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: Spacing.lg },
  sectionBody: { padding: Spacing.lg, gap: Spacing.lg, overflow: 'visible' },

  stack: { gap: Spacing.sm },
  fieldRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: Spacing.base,
    // Lifts this row — and so the Type menu when it is open — above the choice
    // cards that follow it. Siblings with no z-index paint in DOM order, which
    // put the later row on top of the menu and swallowed its clicks. The
    // `Select`'s own z-index only orders the controls inside this row.
    zIndex: 20,
  },
  field: { flex: 1, minWidth: 220 },
  fieldLabel: { marginLeft: Spacing.xs },
  textArea: { minHeight: 104, paddingTop: Spacing.md },

  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  choice: {
    flex: 1,
    minWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 68,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.md,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: Radius.full },
  choiceText: { flex: 1, minWidth: 0 },

  callout: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.base, borderRadius: Radius.md },
  calloutIcon: { marginTop: 1 },
  calloutText: { flex: 1, minWidth: 0 },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  tile: { flexGrow: 1, flexBasis: 150, minWidth: 150, flexDirection: 'row' },

  reachEmpty: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radius.md,
  },
  reachCount: { alignItems: 'center', minWidth: 110 },
  reachDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  reachText: { flex: 1, minWidth: 220 },

  ackPanel: { gap: Spacing.sm, padding: Spacing.base, borderWidth: 1, borderRadius: Radius.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },

  readyPanel: {
    gap: Spacing.base,
    padding: Spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
  },
  readyRows: { gap: Spacing.md },
  readyRow: { flexDirection: 'row', gap: Spacing.md },
  readyIcon: { marginTop: 1 },
  readyText: { flex: 1, minWidth: 0, gap: 1 },
  readyFoot: { textAlign: 'center' },
});
