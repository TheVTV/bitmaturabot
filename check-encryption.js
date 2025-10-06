// Script do sprawdzenia enkrypcji danych w tabeli personal_threads
const mysql = require("mysql2/promise");
const crypto = require("crypto");

// Konfiguracja bazy danych (z migrate-threads-standalone.js)
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
  "5a8f9d2c7e1b4a6c8f3d5e9a2b7c4f1d8e3a6b9c2f5e8a1d4c7b0f3e6a9c2f5e8";
const ALGORITHM = "aes-256-cbc";

// Funkcje dekrypcji
function decryptData(encryptedText) {
  if (!encryptedText) return null;

  try {
    const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
    const [ivHex, encrypted] = encryptedText.split(":");

    if (!ivHex || !encrypted) {
      console.log("⚠️ Dane nie są w formacie zaszyfrowanym");
      return encryptedText; // Zwróć dane niezaszyfrowane
    }

    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("[CRYPTO] Błąd odszyfrowania:", error.message);
    return encryptedText; // Fallback - zwróć oryginalny tekst
  }
}

async function checkEncryption() {
  let connection;

  try {
    console.log("🔗 Łączenie z bazą danych...");
    connection = await mysql.createConnection(DB_CONFIG);
    console.log("✅ Połączono z bazą danych");

    console.log("🔍 Sprawdzanie danych w tabeli personal_threads...");

    // Pobierz wszystkie rekordy
    const [rows] = await connection.execute(
      "SELECT * FROM personal_threads ORDER BY created_at DESC"
    );

    console.log(`📊 Znaleziono ${rows.length} rekordów:`);

    if (rows.length === 0) {
      console.log("❌ Brak danych w tabeli");
      return;
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      console.log(`\n--- Rekord ${i + 1} ---`);
      console.log(`ID: ${row.id}`);
      console.log(`Guild ID: ${row.guild_id}`);
      console.log(`Created: ${row.created_at}`);
      console.log(`Active: ${row.is_active}`);

      // Sprawdź czy dane są zaszyfrowane
      console.log(`\nDane zaszyfrowane:`);
      console.log(
        `User ID encrypted: ${
          row.user_discord_id_encrypted
            ? row.user_discord_id_encrypted.substring(0, 50) + "..."
            : "NULL"
        }`
      );
      console.log(
        `Thread ID encrypted: ${
          row.thread_id_encrypted
            ? row.thread_id_encrypted.substring(0, 50) + "..."
            : "NULL"
        }`
      );
      console.log(
        `Thread name encrypted: ${
          row.thread_name_encrypted
            ? row.thread_name_encrypted.substring(0, 50) + "..."
            : "NULL"
        }`
      );

      // Spróbuj odszyfrować
      console.log(`\nDane odszyfrowane:`);
      const decryptedUserId = decryptData(row.user_discord_id_encrypted);
      const decryptedThreadId = decryptData(row.thread_id_encrypted);
      const decryptedThreadName = decryptData(row.thread_name_encrypted);
      const decryptedChannelId = decryptData(row.channel_id_encrypted);

      console.log(`User ID: ${decryptedUserId}`);
      console.log(`Thread ID: ${decryptedThreadId}`);
      console.log(`Channel ID: ${decryptedChannelId}`);
      console.log(`Thread name: ${decryptedThreadName}`);

      // Sprawdź hashe wyszukiwania
      console.log(`\nHashe wyszukiwania:`);
      console.log(`User hash: ${row.user_discord_id_search_hash}`);
      console.log(`Thread hash: ${row.thread_id_search_hash}`);
    }
  } catch (error) {
    console.error("❌ Błąd:", error);
  } finally {
    if (connection) {
      await connection.end();
      console.log("\n🔌 Rozłączono z bazą danych");
    }
  }
}

// Uruchom sprawdzenie
console.log("🔍 Sprawdzam enkrypcję danych w tabeli personal_threads");
checkEncryption()
  .then(() => {
    console.log("✅ Sprawdzenie zakończone");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Błąd:", error);
    process.exit(1);
  });
