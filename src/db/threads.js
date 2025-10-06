const { getConnection } = require("./database");
const {
  encryptData,
  decryptData,
  generateSearchHash,
} = require("../crypto/encryption");

/**
 * Tworzy tabelę personal_threads jeśli nie istnieje
 */
async function ensurePersonalThreadsTable() {
  const connection = await getConnection();
  try {
    // Sprawdź czy tabela istnieje i czy ma zaszyfrowane kolumny
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personal_threads'
    `);

    const columnNames = columns.map((col) => col.COLUMN_NAME);
    const hasEncryptedColumns = columnNames.includes(
      "user_discord_id_encrypted"
    );

    if (hasEncryptedColumns) {
      // Tabela już ma zaszyfrowane kolumny
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS personal_threads (
          id INT AUTO_INCREMENT PRIMARY KEY,
          guild_id VARCHAR(255) NOT NULL,
          user_discord_id_encrypted TEXT,
          user_discord_id_search_hash VARCHAR(64),
          thread_id_encrypted TEXT,
          thread_id_search_hash VARCHAR(64),
          channel_id_encrypted TEXT,
          thread_name_encrypted TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_user_guild_encrypted (guild_id, user_discord_id_search_hash),
          INDEX idx_thread_search (thread_id_search_hash),
          INDEX idx_guild_user_search (guild_id, user_discord_id_search_hash)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    } else {
      // Stara struktura lub nowa instalacja
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS personal_threads (
          id INT AUTO_INCREMENT PRIMARY KEY,
          guild_id VARCHAR(255) NOT NULL,
          user_discord_id VARCHAR(255) NOT NULL,
          thread_id VARCHAR(255) NOT NULL,
          channel_id VARCHAR(255) NOT NULL,
          thread_name VARCHAR(255) NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_user_guild (guild_id, user_discord_id),
          INDEX idx_thread_id (thread_id),
          INDEX idx_guild_user (guild_id, user_discord_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    }
  } finally {
    connection.release();
  }
}

/**
 * Zapisuje wątek osobisty w bazie danych
 */
async function createPersonalThread(
  guildId,
  userDiscordId,
  threadId,
  channelId,
  threadName
) {
  await ensurePersonalThreadsTable();
  const connection = await getConnection();
  try {
    // Sprawdź czy tabela ma zaszyfrowane kolumny
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personal_threads'
    `);

    const columnNames = columns.map((col) => col.COLUMN_NAME);
    const hasEncryptedColumns = columnNames.includes(
      "user_discord_id_encrypted"
    );

    if (hasEncryptedColumns) {
      // Nowy format z enkrypcją
      const userDiscordIdEncrypted = encryptData(userDiscordId);
      const userDiscordIdSearchHash = generateSearchHash(userDiscordId);
      const threadIdEncrypted = encryptData(threadId);
      const threadIdSearchHash = generateSearchHash(threadId);
      const channelIdEncrypted = encryptData(channelId);
      const threadNameEncrypted = encryptData(threadName);

      await connection.execute(
        `
        INSERT INTO personal_threads (guild_id, user_discord_id_encrypted, user_discord_id_search_hash, 
                                     thread_id_encrypted, thread_id_search_hash, channel_id_encrypted, thread_name_encrypted)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          thread_id_encrypted = VALUES(thread_id_encrypted),
          thread_id_search_hash = VALUES(thread_id_search_hash),
          channel_id_encrypted = VALUES(channel_id_encrypted),
          thread_name_encrypted = VALUES(thread_name_encrypted),
          is_active = TRUE,
          updated_at = CURRENT_TIMESTAMP
      `,
        [
          guildId,
          userDiscordIdEncrypted,
          userDiscordIdSearchHash,
          threadIdEncrypted,
          threadIdSearchHash,
          channelIdEncrypted,
          threadNameEncrypted,
        ]
      );
    } else {
      // Stary format bez enkrypcji
      await connection.execute(
        `
        INSERT INTO personal_threads (guild_id, user_discord_id, thread_id, channel_id, thread_name)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          thread_id = VALUES(thread_id),
          channel_id = VALUES(channel_id),
          thread_name = VALUES(thread_name),
          is_active = TRUE,
          updated_at = CURRENT_TIMESTAMP
      `,
        [guildId, userDiscordId, threadId, channelId, threadName]
      );
    }
  } finally {
    connection.release();
  }
}

/**
 * Pobiera wątek osobisty użytkownika
 */
async function getPersonalThread(guildId, userDiscordId) {
  await ensurePersonalThreadsTable();
  const connection = await getConnection();
  try {
    // Sprawdź czy tabela ma zaszyfrowane kolumny
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personal_threads'
    `);

    const columnNames = columns.map((col) => col.COLUMN_NAME);
    const hasEncryptedColumns = columnNames.includes(
      "user_discord_id_encrypted"
    );

    if (hasEncryptedColumns) {
      // Nowy format z enkrypcją
      const userDiscordIdSearchHash = generateSearchHash(userDiscordId);
      const [rows] = await connection.execute(
        "SELECT * FROM personal_threads WHERE guild_id = ? AND user_discord_id_search_hash = ? AND is_active = TRUE",
        [guildId, userDiscordIdSearchHash]
      );

      if (rows[0]) {
        // Odszyfruj dane
        return {
          id: rows[0].id,
          guild_id: rows[0].guild_id,
          user_discord_id: decryptData(rows[0].user_discord_id_encrypted),
          thread_id: decryptData(rows[0].thread_id_encrypted),
          channel_id: decryptData(rows[0].channel_id_encrypted),
          thread_name: decryptData(rows[0].thread_name_encrypted),
          is_active: rows[0].is_active,
          created_at: rows[0].created_at,
          updated_at: rows[0].updated_at,
        };
      }
      return null;
    } else {
      // Stary format bez enkrypcji
      const [rows] = await connection.execute(
        "SELECT * FROM personal_threads WHERE guild_id = ? AND user_discord_id = ? AND is_active = TRUE",
        [guildId, userDiscordId]
      );
      return rows[0] || null;
    }
  } finally {
    connection.release();
  }
}

/**
 * Dezaktywuje wątek osobisty (gdy zostanie usunięty z Discord)
 */
async function deactivatePersonalThread(guildId, userDiscordId) {
  await ensurePersonalThreadsTable();
  const connection = await getConnection();
  try {
    // Sprawdź czy tabela ma zaszyfrowane kolumny
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personal_threads'
    `);

    const columnNames = columns.map((col) => col.COLUMN_NAME);
    const hasEncryptedColumns = columnNames.includes(
      "user_discord_id_encrypted"
    );

    if (hasEncryptedColumns) {
      // Nowy format z enkrypcją
      const userDiscordIdSearchHash = generateSearchHash(userDiscordId);
      await connection.execute(
        "UPDATE personal_threads SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_discord_id_search_hash = ?",
        [guildId, userDiscordIdSearchHash]
      );
    } else {
      // Stary format bez enkrypcji
      await connection.execute(
        "UPDATE personal_threads SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_discord_id = ?",
        [guildId, userDiscordId]
      );
    }
  } finally {
    connection.release();
  }
}

/**
 * Pobiera statystyki wątków osobistych
 */
async function getThreadStats(guildId) {
  await ensurePersonalThreadsTable();
  const connection = await getConnection();
  try {
    const [rows] = await connection.execute(
      `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN is_active = FALSE THEN 1 ELSE 0 END) as inactive
      FROM personal_threads 
      WHERE guild_id = ?
    `,
      [guildId]
    );
    return rows[0];
  } finally {
    connection.release();
  }
}

/**
 * Pobiera wszystkie aktywne wątki osobiste na serwerze
 */
async function getAllActiveThreads(guildId) {
  await ensurePersonalThreadsTable();
  const connection = await getConnection();
  try {
    // Sprawdź czy tabela ma zaszyfrowane kolumny
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personal_threads'
    `);

    const columnNames = columns.map((col) => col.COLUMN_NAME);
    const hasEncryptedColumns = columnNames.includes(
      "user_discord_id_encrypted"
    );

    if (hasEncryptedColumns) {
      // Nowy format z enkrypcją
      const [rows] = await connection.execute(
        "SELECT * FROM personal_threads WHERE guild_id = ? AND is_active = TRUE ORDER BY created_at DESC",
        [guildId]
      );

      // Odszyfruj dane
      return rows.map((row) => ({
        id: row.id,
        guild_id: row.guild_id,
        user_discord_id: decryptData(row.user_discord_id_encrypted),
        thread_id: decryptData(row.thread_id_encrypted),
        channel_id: decryptData(row.channel_id_encrypted),
        thread_name: decryptData(row.thread_name_encrypted),
        is_active: row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
    } else {
      // Stary format bez enkrypcji
      const [rows] = await connection.execute(
        "SELECT * FROM personal_threads WHERE guild_id = ? AND is_active = TRUE ORDER BY created_at DESC",
        [guildId]
      );
      return rows;
    }
  } finally {
    connection.release();
  }
}

/**
 * Kompletnie usuwa wątek osobisty z bazy danych
 */
async function deletePersonalThread(guildId, userDiscordId) {
  await ensurePersonalThreadsTable();
  const connection = await getConnection();
  try {
    // Sprawdź czy tabela ma zaszyfrowane kolumny
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personal_threads'
    `);

    const columnNames = columns.map((col) => col.COLUMN_NAME);
    const hasEncryptedColumns = columnNames.includes(
      "user_discord_id_encrypted"
    );

    if (hasEncryptedColumns) {
      // Nowy format z enkrypcją
      const userDiscordIdSearchHash = generateSearchHash(userDiscordId);
      await connection.execute(
        "DELETE FROM personal_threads WHERE guild_id = ? AND user_discord_id_search_hash = ?",
        [guildId, userDiscordIdSearchHash]
      );
    } else {
      // Stary format bez enkrypcji
      await connection.execute(
        "DELETE FROM personal_threads WHERE guild_id = ? AND user_discord_id = ?",
        [guildId, userDiscordId]
      );
    }
  } finally {
    connection.release();
  }
}

module.exports = {
  createPersonalThread,
  getPersonalThread,
  deactivatePersonalThread,
  deletePersonalThread,
  getThreadStats,
  getAllActiveThreads,
};
