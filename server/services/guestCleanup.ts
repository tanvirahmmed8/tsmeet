import { pool } from '../db';

/**
 * Guest joins mint a real `users` row so meeting foreign keys and audit records
 * stay valid. Those rows are disposable: the JWT that referenced one lives for
 * 12 hours and can never be re-issued, so a guest row older than the retention
 * window belongs to a meeting that is long over.
 *
 * Without this, a widely shared meeting link grows `users` without bound, and
 * `users` is joined by most queries in the application.
 *
 * Deleting a guest row cascades to that guest's `room_participants`,
 * `meeting_waiting_participants`, and `meeting_roles` rows, so their attendance
 * history goes with it. `security_audit_logs.actor_user_id` is ON DELETE SET
 * NULL, so moderation history survives with an anonymised actor.
 */
export function guestRetentionDays() {
  const parsed = Number(process.env.GUEST_RETENTION_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 7;
}

export async function purgeExpiredGuestIdentities() {
  // The retention window is a validated positive integer; it is inlined
  // because the MySQL prepared-statement protocol does not accept a
  // placeholder inside INTERVAL ... DAY.
  const days = guestRetentionDays();
  const result = await pool.query(
    `DELETE FROM users
     WHERE is_guest = 1
       AND created_at IS NOT NULL
       AND created_at < DATE_SUB(NOW(), INTERVAL ${days} DAY)`
  );
  if (result.rowCount > 0) {
    console.log(`[guests] purged ${result.rowCount} guest identities older than ${days} days`);
  }
  return result.rowCount;
}
