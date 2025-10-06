// Dedykowany script do migracji tabeli personal_threads do formatu z enkrypcją
const mysql = require("mysql2/promise");
const crypto = require("crypto");

// Konfiguracja bazy danych
const DB_CONFIG = {
  host: "65.21.61.192",
  port: 3306,
  user: "u28653_BRUH85ShPw",
  password: "WrzF98@2+rM5VZzwvGeZHbNi",
  database: "s28653_MAIN",
  charset: "utf8mb4",
};

// Klucz enkrypcji (z konfiguracji)
const ENCRYPTION_KEY =
  "5a8f9d2c7e1b4a6c8f3d5e9a2b7c4f1d8e3a6b9c2f5e8a1d4c7b0f3e6a9c2f5e8"; // 64 znaki hex
const ALGORITHM = "aes-256-cbc";

// Funkcje enkrypcji (skopiowane z crypto/encryption.js)
function encryptData(text) {
  if (!text) return null;

  try {
    const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    // Zwracamy iv + encrypted data
    return iv.toString("hex") + ":" + encrypted;
  } catch (error) {
    console.error("[CRYPTO] Błąd szyfrowania:", error.message);
    return text; // Fallback - zwróć oryginalny tekst
  }
}

function generateSearchHash(text) {
  if (!text) return null;
  return crypto
    .createHash("sha256")
    .update(text + ENCRYPTION_KEY)
    .digest("hex");
}

async function migratePersonalThreads() {
  let connection;

  try {
    console.log("🔗 Łączenie z bazą danych...");
    connection = await mysql.createConnection(DB_CONFIG);
    console.log("✅ Połączono z bazą danych");

    console.log("🔍 Sprawdzanie struktury tabeli personal_threads...");

    // Sprawdź czy tabela istnieje
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personal_threads'
    `);

    if (tables.length === 0) {
      console.log(
        "❌ Tabela personal_threads nie istnieje - nie ma czego migrować"
      );
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
      console.log(
        "✅ Tabela już ma zaszyfrowane kolumny - migracja nie jest potrzebna"
      );
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
      console.log("💾 Tworzę backup tabeli...");
      await connection.execute(`
        CREATE TABLE personal_threads_backup_${Date.now()} AS 
        SELECT * FROM personal_threads
      `);
      console.log("✅ Utworzono backup tabeli");
    }

    // Usuń starą tabelę
    console.log("🗑️ Usuwam starą tabelę...");
    await connection.execute("DROP TABLE personal_threads");
    console.log("✅ Usunięto starą tabelę");

    // Utwórz nową tabelę z enkrypcją
    console.log("🆕 Tworzę nową tabelę z enkrypcją...");
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
    console.log("✅ Utworzono nową tabelę z enkrypcją");

    // Migruj dane
    if (existingRows.length > 0) {
      console.log("🔄 Rozpoczynam migrację danych...");

      for (let i = 0; i < existingRows.length; i++) {
        const row = existingRows[i];
        console.log(
          `   Migruję rekord ${i + 1}/${existingRows.length}: User ${
            row.user_discord_id
          }`
        );

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
    console.log("📝 Teraz tabela personal_threads używa enkrypcji AES-256-CBC");
  } catch (error) {
    console.error("❌ Błąd podczas migracji:", error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log("🔌 Rozłączono z bazą danych");
    }
  }
}

// Uruchom migrację
console.log(
  "🚀 Rozpoczynam migrację tabeli personal_threads do formatu z enkrypcją"
);
migratePersonalThreads()
  .then(() => {
    console.log("✅ Script zakończony pomyślnie");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Błąd:", error);
    process.exit(1);
  });
