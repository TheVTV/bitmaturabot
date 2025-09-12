// Załaduj zmienne środowiskowe
require("dotenv").config({
  path: require("path").join(__dirname, "../../.env"),
});

const { getConnection, initDatabase } = require("../db/database");
const { decryptData } = require("../crypto/encryption");

async function initializeUserPoints(guildId) {
  console.log(
    `[INIT-POINTS] Rozpoczynam inicjalizację punktów dla guild ${guildId}...`
  );

  // Inicjalizuj połączenie z bazą danych
  await initDatabase();

  try {
    const connection = await getConnection();

    try {
      // Sprawdź czy mamy nowe kolumny zaszyfrowane w tabeli users
      const [columns] = await connection.execute(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
      `);

      const columnNames = columns.map((col) => col.COLUMN_NAME);
      const hasEncryptedColumns = columnNames.includes("email_encrypted");

      let query, userRows;

      if (hasEncryptedColumns) {
        // Nowy sposób - zaszyfrowane kolumny
        [userRows] = await connection.execute(
          "SELECT discord_id_encrypted FROM users WHERE discord_id_encrypted IS NOT NULL"
        );
      } else {
        // Stary sposób - niezaszyfrowane kolumny
        [userRows] = await connection.execute(
          "SELECT discord_id FROM users WHERE discord_id IS NOT NULL"
        );
      }

      console.log(
        `[INIT-POINTS] Znaleziono ${userRows.length} użytkowników w bazie danych`
      );

      let addedCount = 0;
      let skippedCount = 0;

      for (const row of userRows) {
        let discordId;

        if (hasEncryptedColumns) {
          discordId = decryptData(row.discord_id_encrypted);
        } else {
          discordId = row.discord_id;
        }

        if (!discordId) {
          console.log(`[INIT-POINTS] Pominięto użytkownika bez discord_id`);
          skippedCount++;
          continue;
        }

        // Sprawdź czy użytkownik już ma rekord w tabeli punktów
        const [existingPoints] = await connection.execute(
          "SELECT discord_id FROM user_points WHERE discord_id = ? AND guild_id = ?",
          [discordId, guildId]
        );

        if (existingPoints.length > 0) {
          console.log(
            `[INIT-POINTS] Użytkownik ${discordId} już ma punkty - pomijam`
          );
          skippedCount++;
          continue;
        }

        // Dodaj użytkownika z 0 punktami
        await connection.execute(
          "INSERT INTO user_points (discord_id, guild_id, points) VALUES (?, ?, 0.0)",
          [discordId, guildId]
        );

        console.log(
          `[INIT-POINTS] Dodano użytkownika ${discordId} z 0 punktami`
        );
        addedCount++;
      }

      console.log(`[INIT-POINTS] Zakończono inicjalizację:`);
      console.log(`  - Dodano: ${addedCount} użytkowników`);
      console.log(
        `  - Pominięto: ${skippedCount} użytkowników (już mieli punkty lub brak discord_id)`
      );
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("[INIT-POINTS] Błąd podczas inicjalizacji punktów:", error);
    throw error;
  }
}

// Funkcja do uruchomienia skryptu
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Użycie: node initialize-points.js <guild_id>");
    console.error("Przykład: node initialize-points.js 1395757947564331180");
    process.exit(1);
  }

  const guildId = args[0];

  if (!guildId || isNaN(guildId)) {
    console.error("Błąd: Podaj prawidłowe guild_id (liczba)");
    process.exit(1);
  }

  try {
    await initializeUserPoints(guildId);
    console.log("[INIT-POINTS] Skrypt zakończony pomyślnie!");
    process.exit(0);
  } catch (error) {
    console.error("[INIT-POINTS] Skrypt zakończony błędem:", error.message);
    process.exit(1);
  }
}

// Uruchom tylko jeśli plik jest wywoływany bezpośrednio
if (require.main === module) {
  main();
}

module.exports = { initializeUserPoints };
