// Sprawdzanie tabel backup
const mysql = require("mysql2/promise");

const DB_CONFIG = {
  host: "65.21.61.192",
  port: 3306,
  user: "u28653_BRUH85ShPw",
  password: "WrzF98@2+rM5VZzwvGeZHbNi",
  database: "s28653_MAIN",
  charset: "utf8mb4",
};

async function checkBackups() {
  let connection;

  try {
    connection = await mysql.createConnection(DB_CONFIG);

    const [tables] = await connection.execute(
      "SHOW TABLES LIKE 'personal_threads_backup%'"
    );

    console.log("📋 Tabele backup:");
    for (const table of tables) {
      const tableName = Object.values(table)[0];
      console.log(`  - ${tableName}`);

      // Sprawdź ile rekordów
      const [count] = await connection.execute(
        `SELECT COUNT(*) as count FROM \`${tableName}\``
      );
      console.log(`    Rekordów: ${count[0].count}`);
    }
  } catch (error) {
    console.error("❌ Błąd:", error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkBackups();
