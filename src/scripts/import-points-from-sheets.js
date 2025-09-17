const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const { getConnection } = require("../db/database");
const { decryptData } = require("../crypto/encryption");
const USERS_TABLE = "users";
const POINTS_TABLE = "user_points";
const CREDENTIALS_PATH = path.join(__dirname, "../../credentials.json");
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

let sheetsCache = {};

async function authorize() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
  const scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"];
  const auth = new google.auth.GoogleAuth({ credentials, scopes });
  return await auth.getClient();
}

async function fetchAllSheets() {
  const authClient = await authorize();
  const sheets = google.sheets({ version: "v4", auth: authClient });
  console.log("Ładuję dane z arkuszy...");
  let loaded = 0;
  let errors = [];
  for (let i = 1; i <= 12; i++) {
    const sheetName = `Grupa${i}`;
    let attempt = 0;
    let success = false;
    let lastError = null;
    while (attempt < 3 && !success) {
      try {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheetName}!B2:BF100`,
        });
        sheetsCache[sheetName] = res.data.values || [];
        loaded++;
        success = true;
      } catch (err) {
        lastError = err;
        attempt++;
        if (err.code === "ECONNRESET" || err.message.includes("ECONNRESET")) {
          await new Promise((res) => setTimeout(res, 2000));
        } else {
          sheetsCache[sheetName] = [];
          break;
        }
        if (attempt === 3 && !success) {
          sheetsCache[sheetName] = [];
        }
      }
    }
    if (!success) {
      errors.push({
        sheet: sheetName,
        error: lastError ? lastError.message : "Nieznany błąd",
      });
    }
  }
  let report = `Ładowanie arkuszy zakończone.\n`;
  report += `Załadowano: ${loaded} arkuszy\n`;
  report += `Błędy: ${errors.length}`;
  if (errors.length > 0) {
    report += `\nBłędne arkusze:`;
    for (const e of errors) {
      report += `\n- ${e.sheet}: ${e.error}`;
    }
  }
  console.log(report);
}

async function getAllUsers() {
  let attempt = 0;
  const maxRetries = 3;

  while (attempt < maxRetries) {
    let connection;
    try {
      connection = await getConnection();
      const [rows] = await connection.execute(
        `SELECT fullname_encrypted, discord_id_encrypted, group_number FROM ${USERS_TABLE}`
      );
      return rows.map((row) => ({
        fullname: row.fullname_encrypted
          ? decryptData(row.fullname_encrypted)
          : null,
        discordId: row.discord_id_encrypted
          ? decryptData(row.discord_id_encrypted)
          : null,
        group: row.group_number,
      }));
    } catch (error) {
      console.error(
        `[DB] Błąd przy pobieraniu użytkowników (próba ${
          attempt + 1
        }/${maxRetries}):`,
        error.message
      );
      attempt++;

      if (attempt >= maxRetries) {
        throw error;
      }

      // Czekaj przed ponowną próbą
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
}

async function updateUserPoints(discordId, points, guildId) {
  let attempt = 0;
  const maxRetries = 3;

  while (attempt < maxRetries) {
    let connection;
    try {
      connection = await getConnection();
      const [result] = await connection.execute(
        `UPDATE ${POINTS_TABLE} SET points = ? WHERE discord_id = ? AND guild_id = ?`,
        [points, discordId, guildId]
      );
      if (result.affectedRows === 0) {
        await connection.execute(
          `INSERT INTO ${POINTS_TABLE} (discord_id, points, guild_id) VALUES (?, ?, ?)`,
          [discordId, points, guildId]
        );
      }
      return; // Sukces, wyjdź z pętli
    } catch (error) {
      console.error(
        `[DB] Błąd przy aktualizacji punktów (próba ${
          attempt + 1
        }/${maxRetries}):`,
        error.message
      );
      attempt++;

      if (attempt >= maxRetries) {
        throw error;
      }

      // Czekaj przed ponowną próbą
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
}

async function importPointsFromCache(guildId) {
  try {
    const users = await getAllUsers();
    console.log("Aktualizuję punkty...");
    let total = 0;
    let changed = 0;
    let errors = [];
    for (const user of users) {
      if (!user.fullname || !user.discordId || !user.group) continue;
      total++;
      const sheetName = `Grupa${user.group}`;
      const rows = sheetsCache[sheetName] || [];
      let found = false;
      for (const row of rows) {
        const [imie, nazwisko] = [row[0], row[1]];
        if (!imie || !nazwisko) continue;
        if (user.fullname.includes(imie) && user.fullname.includes(nazwisko)) {
          let punkty = row[56];
          if (typeof punkty === "string") {
            punkty = punkty.replace(",", ".");
          }
          punkty = parseFloat(punkty) || 0;
          try {
            // Pobierz stare punkty
            const { getUserPoints } = require("../db/points");
            const oldPoints = await getUserPoints(user.discordId, guildId);
            // Porównaj, czy się zmieniły
            if (Number(oldPoints) !== Number(punkty)) changed++;
            await updateUserPoints(user.discordId, punkty, guildId);
          } catch (err) {
            console.error(
              `[POINTS] Błąd aktualizacji punktów dla ${user.fullname}:`,
              err.message
            );
            errors.push({
              fullname: user.fullname,
              discordId: user.discordId,
              error: err.message || String(err),
            });
          }
          found = true;
          break;
        }
      }
      if (!found) {
        errors.push({
          fullname: user.fullname,
          discordId: user.discordId,
          error: "Nie znaleziono w arkuszu",
        });
      }
    }
    let report = `Import punktów zakończony.\n`;
    report += `Liczba osób: ${total}\n`;
    report += `Liczba osób z nowym wynikiem: ${changed}\n`;
    report += `Liczba osób z błędami: ${errors.length}`;
    if (errors.length > 0) {
      report += `\nBłędy:\n`;
      for (const e of errors) {
        report += `- ${e.fullname} (${e.discordId}): ${e.error}\n`;
      }
    }
    console.log(report);
  } catch (error) {
    console.error(
      "[IMPORT] Krytyczny błąd podczas importu punktów:",
      error.message
    );
    console.log("Import punktów przerwany z powodu błędu bazy danych.");
  }
}

async function initializeSheetsAndImport(guildId) {
  // Jednokratowe pobranie i import
  await fetchAllSheets();
  await importPointsFromCache(guildId);
}

// Przykład uruchomienia:
// importPointsFromSheets(<GUILD_ID>);

module.exports = {
  initializeSheetsAndImport,
  getSheetsCache: () => sheetsCache,
  fetchAllSheets,
  importPointsFromCache,
};
