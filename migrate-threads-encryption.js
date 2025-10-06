// Script do sprawdzenia i migracji tabeli personal_threads do formatu z enkrypcją
require("dotenv").config();
const { getConnection } = require("./src/db/database");
const { encryptData, generateSearchHash } = require("./src/crypto/encryption");

async function checkAndMigratePersonalThreads() {
  const connection = await getConnection();

  try {
    console.log("🔍 Sprawdzanie struktury tabeli personal_threads...");

    // Sprawdź czy tabela istnieje
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personal_threads'
    `);

    if (tables.length === 0) {
      console.log("❌ Tabela personal_threads nie istnieje");
      return;
    }

    // Sprawdź strukturę kolumn
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personal_threads'
      ORDER BY ORDINAL_POSITION
    `);

    console.log("📋 Aktualne kolumny:");
    columns.forEach((col) => {
      console.log(`   - ${col.COLUMN_NAME} (${col.DATA_TYPE})`);
    });

    const columnNames = columns.map((col) => col.COLUMN_NAME);
    const hasEncryptedColumns = columnNames.includes(
      "user_discord_id_encrypted"
    );

    if (hasEncryptedColumns) {
      console.log("✅ Tabela już ma zaszyfrowane kolumny");
      return;
    }

    console.log("🔄 Tabela używa starego formatu. Rozpoczynam migrację...");

    // Pobierz istniejące dane
    const [existingRows] = await connection.execute(
      "SELECT * FROM personal_threads"
    );

    console.log(`📊 Znaleziono ${existingRows.length} rekordów do migracji`);

    if (existingRows.length > 0) {
      // Utwórz tabelę backup
      await connection.execute(`
        CREATE TABLE personal_threads_backup AS 
        SELECT * FROM personal_threads
      `);
      console.log("💾 Utworzono backup tabeli");
    }

    // Usuń starą tabelę
    await connection.execute("DROP TABLE personal_threads");
    console.log("🗑️ Usunięto starą tabelę");

    // Utwórz nową tabelę z enkrypcją
    await connection.execute(`
      CREATE TABLE personal_threads (
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
    console.log("🆕 Utworzono nową tabelę z enkrypcją");

    // Migruj dane
    if (existingRows.length > 0) {
      console.log("🔄 Rozpoczynam migrację danych...");

      for (const row of existingRows) {
        const userDiscordIdEncrypted = encryptData(row.user_discord_id);
        const userDiscordIdSearchHash = generateSearchHash(row.user_discord_id);
        const threadIdEncrypted = encryptData(row.thread_id);
        const threadIdSearchHash = generateSearchHash(row.thread_id);
        const channelIdEncrypted = encryptData(row.channel_id);
        const threadNameEncrypted = encryptData(row.thread_name);

        await connection.execute(
          `
          INSERT INTO personal_threads 
          (guild_id, user_discord_id_encrypted, user_discord_id_search_hash, 
           thread_id_encrypted, thread_id_search_hash, channel_id_encrypted, 
           thread_name_encrypted, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            row.guild_id,
            userDiscordIdEncrypted,
            userDiscordIdSearchHash,
            threadIdEncrypted,
            threadIdSearchHash,
            channelIdEncrypted,
            threadNameEncrypted,
            row.is_active,
            row.created_at,
            row.updated_at,
          ]
        );
      }

      console.log(`✅ Zmigrowano ${existingRows.length} rekordów`);
    }

    console.log("🎉 Migracja zakończona pomyślnie!");
  } catch (error) {
    console.error("❌ Błąd podczas migracji:", error);
  } finally {
    connection.release();
  }
}

// Uruchom migrację
checkAndMigratePersonalThreads()
  .then(() => {
    console.log("✅ Script zakończony");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Błąd:", error);
    process.exit(1);
  });
