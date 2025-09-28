require("dotenv").config();
const { getConnection, initDatabase } = require("../db/database");

async function migrateToNumerIndeksu() {
  let connection;

  try {
    // Zainicjalizuj bazę danych
    await initDatabase();
    connection = await getConnection();

    console.log(
      "[MIGRATION] Rozpoczynam migrację od szkopul_id do numer_indeksu..."
    );

    // Sprawdź aktualne kolumny
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users'
    `);

    const columnNames = columns.map((col) => col.COLUMN_NAME);
    console.log("[MIGRATION] Obecne kolumny:", columnNames.join(", "));

    // Krok 1: Dodaj nowe kolumny dla numer_indeksu (jeśli nie istnieją)
    if (!columnNames.includes("numer_indeksu_encrypted")) {
      console.log(
        "[MIGRATION] Dodaję kolumny numer_indeksu_encrypted i numer_indeksu_search_hash..."
      );

      await connection.execute(`
        ALTER TABLE users 
        ADD COLUMN numer_indeksu_encrypted TEXT,
        ADD COLUMN numer_indeksu_search_hash VARCHAR(64),
        ADD INDEX idx_numer_indeksu_search (numer_indeksu_search_hash)
      `);

      console.log("[MIGRATION] ✅ Dodano kolumny numer_indeksu");
    } else {
      console.log("[MIGRATION] Kolumny numer_indeksu już istnieją");
    }

    // Krok 2: Opcjonalnie skopiuj dane ze szkopul_id do numer_indeksu (jeśli użytkownik chce)
    if (columnNames.includes("szkopul_id_encrypted")) {
      console.log("[MIGRATION] Sprawdzam dane w szkopul_id_encrypted...");

      const [szkopulData] = await connection.execute(`
        SELECT COUNT(*) as count FROM users WHERE szkopul_id_encrypted IS NOT NULL
      `);

      if (szkopulData[0].count > 0) {
        console.log(
          `[MIGRATION] ⚠️  Znaleziono ${szkopulData[0].count} rekordów z szkopul_id`
        );
        console.log(
          "[MIGRATION] Jeśli chcesz skopiować dane ze szkopul_id do numer_indeksu, odkomentuj linię poniżej:"
        );
        console.log(
          "[MIGRATION] // UPDATE users SET numer_indeksu_encrypted = szkopul_id_encrypted, numer_indeksu_search_hash = szkopul_id_search_hash WHERE szkopul_id_encrypted IS NOT NULL;"
        );

        // Odkomentuj poniższą linię jeśli chcesz skopiować dane
        // await connection.execute(`
        //   UPDATE users
        //   SET numer_indeksu_encrypted = szkopul_id_encrypted,
        //       numer_indeksu_search_hash = szkopul_id_search_hash
        //   WHERE szkopul_id_encrypted IS NOT NULL
        // `);
        // console.log("[MIGRATION] ✅ Skopiowano dane ze szkopul_id do numer_indeksu");
      }
    }

    // Krok 3: Usuń stare kolumny szkopul_id (ostrzeżenie)
    if (columnNames.includes("szkopul_id_encrypted")) {
      console.log(
        "[MIGRATION] ⚠️  UWAGA: Stare kolumny szkopul_id nadal istnieją"
      );
      console.log(
        "[MIGRATION] Aby je usunąć, odkomentuj poniższe linie w skrypcie:"
      );
      console.log("[MIGRATION] // DROP COLUMN szkopul_id_encrypted");
      console.log("[MIGRATION] // DROP COLUMN szkopul_id_search_hash");
      console.log("[MIGRATION] // DROP INDEX idx_szkopul_search");

      // Odkomentuj poniższe linie aby usunąć stare kolumny (OSTROŻNIE!)
      // console.log("[MIGRATION] Usuwam stare kolumny szkopul_id...");
      //
      // // Najpierw usuń indeks
      // try {
      //   await connection.execute(`ALTER TABLE users DROP INDEX idx_szkopul_search`);
      //   console.log("[MIGRATION] Usunięto indeks idx_szkopul_search");
      // } catch (err) {
      //   console.log("[MIGRATION] Indeks idx_szkopul_search nie istnieje lub już został usunięty");
      // }
      //
      // // Usuń kolumny
      // await connection.execute(`
      //   ALTER TABLE users
      //   DROP COLUMN szkopul_id_encrypted,
      //   DROP COLUMN szkopul_id_search_hash
      // `);
      //
      // console.log("[MIGRATION] ✅ Usunięto stare kolumny szkopul_id");
    }

    // Krok 4: Sprawdź stare niezaszyfrowane kolumny
    if (columnNames.includes("szkopul_id")) {
      console.log(
        "[MIGRATION] ⚠️  Znaleziono starą niezaszyfrowaną kolumnę szkopul_id"
      );
      console.log("[MIGRATION] Aby ją usunąć, odkomentuj poniższą linię:");
      console.log("[MIGRATION] // DROP COLUMN szkopul_id");

      // Odkomentuj aby usunąć
      // await connection.execute(`ALTER TABLE users DROP COLUMN szkopul_id`);
      // console.log("[MIGRATION] ✅ Usunięto starą kolumnę szkopul_id");
    }

    console.log("[MIGRATION] ✅ Migracja zakończona pomyślnie!");
    console.log("[MIGRATION] Nowe kolumny numer_indeksu są gotowe do użycia");
  } catch (error) {
    console.error("[MIGRATION] ❌ Błąd podczas migracji:", error.message);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// Uruchom migrację jeśli skrypt jest wywołany bezpośrednio
if (require.main === module) {
  migrateToNumerIndeksu()
    .then(() => {
      console.log("[MIGRATION] Skrypt zakończony");
      process.exit(0);
    })
    .catch((error) => {
      console.error("[MIGRATION] Błąd:", error);
      process.exit(1);
    });
}

module.exports = { migrateToNumerIndeksu };
