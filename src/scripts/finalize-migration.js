require("dotenv").config();
const { getConnection, initDatabase } = require("../db/database");

async function finalizeMigration() {
  let connection;

  try {
    // Zainicjalizuj bazę danych
    await initDatabase();
    connection = await getConnection();

    console.log(
      "[FINALIZE] Finalizacja migracji - usuwanie starych kolumn szkopul_id..."
    );

    // Sprawdź aktualne kolumny
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users'
    `);

    const columnNames = columns.map((col) => col.COLUMN_NAME);
    console.log("[FINALIZE] Obecne kolumny:", columnNames.join(", "));

    // Sprawdź czy są dane w szkopul_id
    if (columnNames.includes("szkopul_id_encrypted")) {
      const [szkopulData] = await connection.execute(`
        SELECT COUNT(*) as count FROM users WHERE szkopul_id_encrypted IS NOT NULL
      `);

      if (szkopulData[0].count > 0) {
        console.log(
          `[FINALIZE] Kopiuję ${szkopulData[0].count} rekordów ze szkopul_id do numer_indeksu...`
        );

        await connection.execute(`
          UPDATE users 
          SET numer_indeksu_encrypted = szkopul_id_encrypted,
              numer_indeksu_search_hash = szkopul_id_search_hash 
          WHERE szkopul_id_encrypted IS NOT NULL AND numer_indeksu_encrypted IS NULL
        `);

        console.log(
          "[FINALIZE] ✅ Skopiowano dane ze szkopul_id do numer_indeksu"
        );
      }

      // Usuń stare kolumny
      console.log("[FINALIZE] Usuwam stare kolumny szkopul_id...");

      // Najpierw usuń indeks
      try {
        await connection.execute(
          `ALTER TABLE users DROP INDEX idx_szkopul_search`
        );
        console.log("[FINALIZE] Usunięto indeks idx_szkopul_search");
      } catch (err) {
        console.log(
          "[FINALIZE] Indeks idx_szkopul_search nie istnieje lub już został usunięty"
        );
      }

      // Usuń kolumny
      await connection.execute(`
        ALTER TABLE users 
        DROP COLUMN szkopul_id_encrypted,
        DROP COLUMN szkopul_id_search_hash
      `);

      console.log(
        "[FINALIZE] ✅ Usunięto stare kolumny szkopul_id_encrypted i szkopul_id_search_hash"
      );
    }

    // Sprawdź stare niezaszyfrowane kolumny
    if (columnNames.includes("szkopul_id")) {
      console.log(
        "[FINALIZE] Usuwam starą niezaszyfrowaną kolumnę szkopul_id..."
      );

      await connection.execute(`ALTER TABLE users DROP COLUMN szkopul_id`);
      console.log("[FINALIZE] ✅ Usunięto starą kolumnę szkopul_id");
    }

    // Pokaż finalną strukturę
    console.log("[FINALIZE] Sprawdzam finalną strukturę tabeli...");
    const [finalColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users'
      ORDER BY ORDINAL_POSITION
    `);

    const finalColumnNames = finalColumns.map((col) => col.COLUMN_NAME);
    console.log("[FINALIZE] Finalne kolumny:", finalColumnNames.join(", "));

    console.log("[FINALIZE] ✅ Finalizacja migracji zakończona pomyślnie!");
    console.log(
      "[FINALIZE] Tabela users ma teraz tylko kolumny numer_indeksu (bez szkopul_id)"
    );
  } catch (error) {
    console.error("[FINALIZE] ❌ Błąd podczas finalizacji:", error.message);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// Uruchom finalizację jeśli skrypt jest wywołany bezpośrednio
if (require.main === module) {
  finalizeMigration()
    .then(() => {
      console.log("[FINALIZE] Skrypt zakończony");
      process.exit(0);
    })
    .catch((error) => {
      console.error("[FINALIZE] Błąd:", error);
      process.exit(1);
    });
}

module.exports = { finalizeMigration };
