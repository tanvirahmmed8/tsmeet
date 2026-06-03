import mysql, { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

type QueryResult<T = any> = {
  rows: T[];
  rowCount: number;
};

type CompatPool = {
  query: <T = any>(sql: string, params?: any[]) => Promise<QueryResult<T>>;
  end: () => Promise<void>;
};

const rawPool: Pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'videoconference',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_POOL_SIZE || '10', 10),
  queueLimit: 0,
});

function normalizeSql(sql: string) {
  return sql
    .replace(/::jsonb/gi, '')
    .replace(/::json/gi, '')
    .replace(/\$\d+/g, '?');
}

function parseReturning(sql: string) {
  const compact = sql.replace(/\s+/g, ' ').trim();
  const insertMatch = compact.match(
    /^INSERT INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\).*RETURNING\s+(.+)$/i
  );
  if (insertMatch) {
    const table = insertMatch[1];
    const columns = insertMatch[2].split(',').map((c) => c.trim().replace(/`/g, ''));
    const returningFields = insertMatch[3]
      .split(',')
      .map((field) => field.trim())
      .filter(Boolean);
    const idIndex = columns.findIndex((c) => c.toLowerCase() === 'id');
    return { type: 'insert' as const, table, idIndex, returningFields };
  }

  const updateMatch = compact.match(
    /^UPDATE\s+([a-zA-Z_][a-zA-Z0-9_]*).*WHERE\s+id\s*=\s*\$(\d+)\s+RETURNING\s+(.+)$/i
  );
  if (updateMatch) {
    const table = updateMatch[1];
    const idParamOneBased = Number(updateMatch[2]);
    const returningFields = updateMatch[3]
      .split(',')
      .map((field) => field.trim())
      .filter(Boolean);
    return { type: 'update' as const, table, idParamOneBased, returningFields };
  }

  return null;
}

async function queryCompat<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
  const returning = parseReturning(sql);
  const sqlWithoutReturning = sql.replace(/\s+RETURNING\s+.+$/i, '');
  const mysqlSql = normalizeSql(sqlWithoutReturning);

  if (returning?.type === 'insert') {
    const [result] = await rawPool.execute<ResultSetHeader>(mysqlSql, params);
    const idParam =
      returning.idIndex >= 0 ? params[returning.idIndex] : result.insertId || undefined;
    if (idParam === undefined || idParam === null) {
      return { rows: [], rowCount: 0 };
    }
    const selectFields =
      returning.returningFields.length === 1 && returning.returningFields[0] === '*'
        ? '*'
        : returning.returningFields.join(', ');
    const [rows] = await rawPool.execute<RowDataPacket[]>(
      `SELECT ${selectFields} FROM ${returning.table} WHERE id = ?`,
      [idParam]
    );
    return { rows: rows as T[], rowCount: (rows as RowDataPacket[]).length };
  }

  if (returning?.type === 'update') {
    await rawPool.execute(mysqlSql, params);
    const idParam = params[returning.idParamOneBased - 1];
    if (idParam === undefined || idParam === null) {
      return { rows: [], rowCount: 0 };
    }
    const selectFields =
      returning.returningFields.length === 1 && returning.returningFields[0] === '*'
        ? '*'
        : returning.returningFields.join(', ');
    const [rows] = await rawPool.execute<RowDataPacket[]>(
      `SELECT ${selectFields} FROM ${returning.table} WHERE id = ?`,
      [idParam]
    );
    return { rows: rows as T[], rowCount: (rows as RowDataPacket[]).length };
  }

  const [result] = await rawPool.execute(mysqlSql, params);
  if (Array.isArray(result)) {
    return { rows: result as T[], rowCount: result.length };
  }

  const header = result as ResultSetHeader;
  return { rows: [], rowCount: header.affectedRows || 0 };
}

const pool: CompatPool = {
  query: queryCompat,
  end: () => rawPool.end(),
};

// Initialize database schema
export const initializeDatabase = async () => {
  try {
    const addColumnIfMissing = async (tableName: string, columnName: string, definitionSql: string) => {
      const existing = await pool.query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = $1
           AND COLUMN_NAME = $2`,
        [tableName, columnName]
      );
      const count = Number((existing.rows[0] as any)?.cnt || 0);
      if (count === 0) {
        await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
      }
    };

    const createIndexIfMissing = async (tableName: string, indexName: string, columnsSql: string) => {
      const existing = await pool.query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = $1
           AND INDEX_NAME = $2`,
        [tableName, indexName]
      );
      const count = Number((existing.rows[0] as any)?.cnt || 0);
      if (count === 0) {
        await pool.query(`CREATE INDEX ${indexName} ON ${tableName}(${columnsSql})`);
      }
    };

    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(191) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(191) NOT NULL,
        avatar_url VARCHAR(191),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);

    // Rooms table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id CHAR(36) PRIMARY KEY,
        title VARCHAR(191) NOT NULL,
        description TEXT,
        creator_id INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME NULL,
        FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // Calendars table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS calendars (
        id CHAR(36) PRIMARY KEY,
        creator_id INT NOT NULL,
        slug VARCHAR(191) UNIQUE NOT NULL,
        title VARCHAR(191) NOT NULL,
        description TEXT,
        timezone VARCHAR(64) NOT NULL,
        confirmation_message TEXT,
        settings JSON NOT NULL,
        booking_form JSON NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        ended_at DATETIME NULL,
        FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS calendar_disabled_slots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        calendar_id CHAR(36) NOT NULL,
        start_at DATETIME NOT NULL,
        end_at DATETIME NOT NULL,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS calendar_holidays (
        id INT AUTO_INCREMENT PRIMARY KEY,
        calendar_id CHAR(36) NOT NULL,
        holiday_date DATE NOT NULL,
        label VARCHAR(191),
        is_full_day BOOLEAN NOT NULL DEFAULT true,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS calendar_bookings (
        id CHAR(36) PRIMARY KEY,
        calendar_id CHAR(36) NOT NULL,
        assigned_user_id INT NULL,
        assigned_user_name VARCHAR(191) NULL,
        assigned_user_email VARCHAR(191) NULL,
        slot_start_at DATETIME NOT NULL,
        slot_end_at DATETIME NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'confirmed',
        booker_name VARCHAR(191) NOT NULL,
        booker_email VARCHAR(191),
        responses JSON NOT NULL,
        meeting_url TEXT,
        meeting_provider VARCHAR(64),
        confirmation_message TEXT,
        reminder_offsets JSON NOT NULL,
        reminder_schedule JSON NOT NULL,
        canceled_at DATETIME NULL,
        cancel_reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE
      );
    `);

    // Backward-compatible schema upgrades for existing databases.
    await addColumnIfMissing('calendar_bookings', 'assigned_user_id', 'INT NULL');
    await addColumnIfMissing('calendar_bookings', 'assigned_user_name', 'VARCHAR(191) NULL');
    await addColumnIfMissing('calendar_bookings', 'assigned_user_email', 'VARCHAR(191) NULL');

    await createIndexIfMissing('calendars', 'idx_calendars_creator_id', 'creator_id');
    await createIndexIfMissing('calendars', 'idx_calendars_slug', 'slug');
    await createIndexIfMissing('calendar_disabled_slots', 'idx_calendar_disabled_slots_calendar_id', 'calendar_id');
    await createIndexIfMissing('calendar_holidays', 'idx_calendar_holidays_calendar_id', 'calendar_id');
    await createIndexIfMissing('calendar_bookings', 'idx_calendar_bookings_calendar_id', 'calendar_id');
    await createIndexIfMissing('calendar_bookings', 'idx_calendar_bookings_slot_start_at', 'slot_start_at');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS recordings (
        id CHAR(36) PRIMARY KEY,
        room_id CHAR(36) NOT NULL,
        creator_id INT NOT NULL,
        started_by_user_id INT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'recording',
        video_path VARCHAR(191) NULL,
        audio_path VARCHAR(191) NULL,
        video_size_bytes BIGINT NULL,
        audio_size_bytes BIGINT NULL,
        mime_type_video VARCHAR(64) NULL,
        mime_type_audio VARCHAR(64) NULL,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    await createIndexIfMissing('recordings', 'idx_recordings_room_id', 'room_id');
    await createIndexIfMissing('recordings', 'idx_recordings_creator_id', 'creator_id');
    await createIndexIfMissing('recordings', 'idx_recordings_started_at', 'started_at');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS recording_sessions (
        id CHAR(36) PRIMARY KEY,
        room_id CHAR(36) NOT NULL,
        creator_id INT NOT NULL,
        started_by_user_id INT NOT NULL,
        status VARCHAR(32) NOT NULL,
        hidden_recorder_socket_id VARCHAR(191) NULL,
        recorder_service_instance_id VARCHAR(191) NULL,
        started_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        completed_at DATETIME NULL,
        last_heartbeat_at DATETIME NULL,
        failure_reason TEXT,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    await createIndexIfMissing('recording_sessions', 'idx_recording_sessions_room_id', 'room_id');
    await createIndexIfMissing('recording_sessions', 'idx_recording_sessions_status', 'status');
    await createIndexIfMissing('recording_sessions', 'idx_recording_sessions_started_at', 'started_at');

    // Chat messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_id CHAR(36) NOT NULL,
        user_id INT NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // Room participants table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS room_participants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_id CHAR(36) NOT NULL,
        user_id INT NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        left_at DATETIME NULL,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // Ensure JSON columns have sane defaults in MySQL.
    await pool.query("UPDATE calendars SET settings = '{}' WHERE settings IS NULL");
    await pool.query("UPDATE calendars SET booking_form = '{\"fields\": []}' WHERE booking_form IS NULL");
    await pool.query("UPDATE calendar_bookings SET responses = '{}' WHERE responses IS NULL");
    await pool.query("UPDATE calendar_bookings SET reminder_offsets = '[10,5,1]' WHERE reminder_offsets IS NULL");
    await pool.query("UPDATE calendar_bookings SET reminder_schedule = '[]' WHERE reminder_schedule IS NULL");

    // Dev convenience: seed the demo user that the docs reference.
    if ((process.env.NODE_ENV || 'development') !== 'production') {
      const demoEmail = 'demo@example.com';
      const demoPassword = 'demo123456';
      const demoName = 'Demo User';

      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [demoEmail]);
      if (existing.rows.length === 0) {
        const passwordHash = await bcrypt.hash(demoPassword, 10);
        await pool.query(
          'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)',
          [demoEmail, passwordHash, demoName]
        );
      }
    }

    console.log('✅ Database initialized successfully (MySQL)');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    process.exit(1);
  }
};

export { pool };
