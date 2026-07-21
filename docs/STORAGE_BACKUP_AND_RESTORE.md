# Recording storage backup and restore

TSMeet recording objects live in the private `tsmeet-recordings` MinIO bucket and
their ownership/index metadata lives in MySQL. A usable backup must contain both.

## Backup

1. Put the application in maintenance mode or stop new recording jobs.
2. Create a MySQL dump with `mysqldump --single-transaction videoconference`.
3. Configure MinIO Client aliases for the primary server and a second server or
   encrypted offline disk.
4. Run `mc mirror --overwrite --remove primary/tsmeet-recordings backup/tsmeet-recordings`.
5. Encrypt the MySQL dump and backup disk, then record checksums and the backup date.

Run this daily and retain at least seven daily and four weekly recovery points.
The backup target must not share the primary server or filesystem.

## Restore drill

1. Start an isolated MySQL and MinIO environment.
2. Restore the SQL dump before accepting application traffic.
3. Run `mc mirror backup/tsmeet-recordings restored/tsmeet-recordings`.
4. Keep the restored bucket private with `mc anonymous set none`.
5. Sign in as a recording owner, request a five-minute download URL, download the
   MP4, and verify it with `ffprobe`.
6. Confirm another user receives HTTP 403 for the same recording ID.
7. Record the drill date, restore duration, object count, byte count, and checksum result.

Production readiness requires completing this drill against a disposable restore
environment; documentation alone is not evidence of a successful restore.

## Local restore drill record

- Date: 2026-07-20
- MySQL: restored the live `videoconference` dump into disposable
  `tsmeet_restore_probe`; 16/16 tables and 105/105 user rows matched.
- MinIO: mirrored the private recording bucket through disposable backup and
  restore buckets; 12/12 objects matched and `mc diff` reported zero differences.
- Cleanup: the disposable database, dump, and both probe buckets were removed.
- Scope: this validates the restore procedure locally. Production drills must
  additionally use the off-host backup destination described above.
