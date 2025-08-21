const mysql = require("mysql2/promise");

let pool = null;

async function initDatabase() {
  try {
    let dbConfig;

    // Sprawdź czy jest JDBC Connection String
    if (process.env.DATABASE_URL) {
      // Parse JDBC URL: może być jdbc:mysql://... lub mysql://...
      let urlString = process.env.DATABASE_URL;
      if (urlString.startsWith("jdbc:")) {
        urlString = urlString.replace("jdbc:", "");
      }

      const url = new URL(urlString);
      dbConfig = {
        host: url.hostname,
        port: url.port || 3306,
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.slice(1), // usuń początkowy slash
      };
    } else {
      // Użyj standardowych zmiennych
      dbConfig = {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      };
    }

    // Sprawdź czy wszystkie wymagane dane są dostępne
    if (!dbConfig.host || !dbConfig.user || !dbConfig.database) {
      throw new Error("Brakuje danych połączenia MySQL. Sprawdź .env");
    }

    // Twórz pool połączeń
    pool = mysql.createPool({
      ...dbConfig,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: "utf8mb4",
      timezone: "Z",
    });

    // Test połączenia
    const testConnection = await pool.getConnection();
    await testConnection.ping();
    testConnection.release();

    // Twórz tabele jeśli nie istnieją
    await createTables();
    console.log(
      `[DB] Połączenie z MySQL ustanowione: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`
    );
  } catch (error) {
    console.error("[DB] Błąd połączenia z bazą MySQL:", error.message);
    console.log("[DB] Sprawdź dane w .env:");
    console.log("  - DB_HOST, DB_USER, DB_PASSWORD, DB_NAME");
    console.log("  - lub DATABASE_URL (mysql://user:pass@host:port/db)");
    process.exit(1);
  }
}

async function createTables() {
  const connection = await pool.getConnection();

  try {
    // Sprawdź czy tabela już istnieje
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
    `);

    if (tables.length === 0) {
      // Utwórz nową tabelę od razu z szyfrowaniem
      await connection.execute(`
        CREATE TABLE users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          email_encrypted TEXT NOT NULL,
          email_search_hash VARCHAR(64) UNIQUE NOT NULL,
          group_number VARCHAR(50) NOT NULL,
          fullname_encrypted TEXT,
          discord_id_encrypted TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_email_search (email_search_hash)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("[DB] Utworzono nową tabelę users z szyfrowaniem");
    } else {
      // Tabela istnieje - sprawdź i dodaj kolumny szyfrowania
      const [columns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users'
      `);

      const columnNames = columns.map((col) => col.COLUMN_NAME);

      // Dodaj nowe kolumny jeśli ich nie ma
      if (!columnNames.includes("email_encrypted")) {
        console.log("[DB] Rozpoczynam migrację do zaszyfrowanego schematu...");

        await connection.execute(`
          ALTER TABLE users 
          ADD COLUMN email_encrypted TEXT,
          ADD COLUMN email_search_hash VARCHAR(64),
          ADD COLUMN fullname_encrypted TEXT,
          ADD COLUMN discord_id_encrypted TEXT,
          ADD INDEX idx_email_search (email_search_hash)
        `);

        // Jeśli są stare dane, ustaw email jako nullable
        if (columnNames.includes("email")) {
          await connection.execute(`
            ALTER TABLE users MODIFY email VARCHAR(255) NULL
          `);
        }

        console.log(
          "[DB] Dodano nowe kolumny dla szyfrowania. Dane będą migrowane przy pierwszym użyciu."
        );
      }
    }

    // Tabela konfiguracji serwerów
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS server_configs (
        guild_id VARCHAR(255) PRIMARY KEY,
        student_role VARCHAR(255) NOT NULL,
        teacher_role VARCHAR(255),
        admin_role VARCHAR(255),
        group_roles JSON NOT NULL,
        configured_by VARCHAR(255) NOT NULL,
        configured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Dodaj nowe kolumny jeśli nie istnieją (migracja)
    try {
      await connection.execute(`
        ALTER TABLE server_configs 
        ADD COLUMN teacher_role VARCHAR(255) AFTER student_role
      `);
      console.log("[DB] Dodano kolumnę teacher_role");
    } catch (error) {
      // Kolumna już istnieje
    }

    try {
      await connection.execute(`
        ALTER TABLE server_configs 
        ADD COLUMN admin_role VARCHAR(255) AFTER teacher_role
      `);
      console.log("[DB] Dodano kolumnę admin_role");
    } catch (error) {
      // Kolumna już istnieje
    }

    console.log("[DB] Tabele sprawdzone/utworzone");
  } catch (error) {
    console.error("[DB] Błąd tworzenia tabel:", error.message);
    throw error;
  } finally {
    connection.release();
  }
}

async function getConnection() {
  if (!pool) {
    throw new Error("Baza danych nie została zainicjalizowana");
  }
  return await pool.getConnection();
}

async function closeDatabase() {
  if (pool) {
    await pool.end();
    console.log("[DB] Połączenie z bazą zamknięte");
  }
}

module.exports = {
  initDatabase,
  getConnection,
  closeDatabase,
};
