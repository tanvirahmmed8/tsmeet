import { pool } from '../db';

export async function writeAuditLog(input: {
  roomId?: string | null;
  actorUserId?: string | null;
  action: string;
  targetUserId?: string | null;
  details?: Record<string, unknown>;
}) {
  await pool.query(
    `INSERT INTO security_audit_logs
      (room_id, actor_user_id, action, target_user_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.roomId || null,
      input.actorUserId || null,
      input.action,
      input.targetUserId || null,
      JSON.stringify(input.details || {}),
    ]
  );
}
