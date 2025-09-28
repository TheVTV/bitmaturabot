require("dotenv").config();
const { getConnection, initDatabase } = require("../db/database");

async function removeOldColumns() {
  let connection;

  try {
    // Zainicjalizuj bazę danych
    await initDatabase();
    connection = await getConnection();

    console.log("[REMOVE] Usuwanie starych kolumn szkopul_id...");

    // Sprawdź aktualne kolumny
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users'
    `);

    const columnNames = columns.map((col) => col.COLUMN_NAME);
    console.log("[REMOVE] Obecne kolumny:", columnNames.join(", "));

    // Usuń zaszyfrowane kolumny szkopul_id
    if (columnNames.includes("szkopul_id_encrypted")) {
      console.log(
        "[REMOVE] Usuwam szkopul_id_encrypted i szkopul_id_search_hash..."
      );

      // Najpierw usuń indeks
      try {
        await connection.execute(
          `ALTER TABLE users DROP INDEX idx_szkopul_search`
        );
        console.log("[REMOVE] Usunięto indeks idx_szkopul_search");
      } catch (err) {
        console.log(
          "[REMOVE] Indeks idx_szkopul_search nie istnieje lub już został usunięty"
        );
      }

      // Usuń kolumny
      await connection.execute(`
        ALTER TABLE users 
        DROP COLUMN szkopul_id_encrypted,
        DROP COLUMN szkopul_id_search_hash
      `);

      console.log(
        "[REMOVE] ✅ Usunięto kolumny szkopul_id_encrypted i szkopul_id_search_hash"
      );
    }

    // Usuń niezaszyfrowaną kolumnę szkopul_id
    if (columnNames.includes("szkopul_id")) {
      console.log("[REMOVE] Usuwam szkopul_id...");

      await connection.execute(`ALTER TABLE users DROP COLUMN szkopul_id`);
      console.log("[REMOVE] ✅ Usunięto kolumnę szkopul_id");
    }

    // Pokaż finalną strukturę
    console.log("[REMOVE] Sprawdzam finalną strukturę tabeli...");
    const [finalColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users'
      ORDER BY ORDINAL_POSITION
    `);

    const finalColumnNames = finalColumns.map((col) => col.COLUMN_NAME);
    console.log("[REMOVE] Finalne kolumny:", finalColumnNames.join(", "));

    console.log("[REMOVE] ✅ Usunięcie starych kolumn szkopul_id zakończone!");
  } catch (error) {
    console.error("[REMOVE] ❌ Błąd podczas usuwania kolumn:", error.message);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// Uruchom usuwanie jeśli skrypt jest wywołany bezpośrednio
if (require.main === module) {
  removeOldColumns()
    .then(() => {
      console.log("[REMOVE] Skrypt zakończony");
      process.exit(0);
    })
    .catch((error) => {
      console.error("[REMOVE] Błąd:", error);
      process.exit(1);
    });
}

module.exports = { removeOldColumns };
