/**
 * Admin audit trail. Every admin mutation records who did what to which target,
 * in the same request handler as the mutation, before returning — an action
 * that cannot be audited does not ship.
 *
 * `logAdminAction` *returns* the insert rather than awaiting it so a caller can
 * hand it to `db.batch` alongside the mutation where the two must commit
 * together (neon-http has no interactive transactions). Use `await
 * logAdminAction(...)` directly only where the audit row must land first — the
 * account-delete case, whose cascade leaves nothing left to reference.
 *
 * Server-only.
 */
import { adminAuditLog } from '@/db/schema';
import { db } from './db';

export type AdminAuditEntry = {
  /** The acting admin's user id. */
  actorId: string;
  /** Dotted verb naming the capability, e.g. 'request.takedown'. */
  action: string;
  /** Domain of the target, e.g. 'request' | 'user' | 'center'. */
  targetType: string;
  /** Id of the affected row. Stored as plain text so it outlives a delete. */
  targetId: string;
  /** Operator-supplied justification. Required by routes that take one. */
  reason?: string | null;
  /** Snapshot of what changed, or of the target itself before a delete. */
  metadata?: Record<string, unknown> | null;
};

export function logAdminAction(entry: AdminAuditEntry) {
  return db.insert(adminAuditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    reason: entry.reason ?? null,
    metadata: entry.metadata ?? null,
  });
}
