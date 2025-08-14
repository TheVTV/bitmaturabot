const { getConnection } = require("./database");
const {
  encryptData,
  decryptData,
  generateSearchHash,
} = require("../crypto/encryption");

let usersCache = new Map();
let lastCacheUpdate = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minut

async function loadUsers() {
  try {
    const connection = await getConnection();

    try {
      // Sprawdź czy mamy nowe kolumny zaszyfrowane
      const [columns] = await connection.execute(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
      `);

      const columnNames = columns.map((col) => col.COLUMN_NAME);
      const hasEncryptedColumns = columnNames.includes("email_encrypted");

      let query, rows;

      if (hasEncryptedColumns) {
        // Nowy sposób - zaszyfrowane kolumny
        [rows] = await connection.execute(
          "SELECT email_encrypted, email_search_hash, group_number, fullname_encrypted, discord_id_encrypted FROM users ORDER BY id"
        );
      } else {
        // Stary sposób - niezaszyfrowane kolumny (wsteczna kompatybilność)
        [rows] = await connection.execute(
          "SELECT email, group_number, fullname, discord_id FROM users ORDER BY id"
        );
      }

      usersCache.clear();

      for (const row of rows) {
        let email, fullname, discordId;

        if (hasEncryptedColumns) {
          // Odszyfruj dane
          email = decryptData(row.email_encrypted);
          fullname = row.fullname_encrypted
            ? decryptData(row.fullname_encrypted)
            : null;
          discordId = row.discord_id_encrypted
            ? decryptData(row.discord_id_encrypted)
            : null;

          // Użyj search hash jako klucza cache
          const searchKey =
            row.email_search_hash || email?.toLowerCase().trim();
          if (searchKey && email) {
            usersCache.set(searchKey, {
              email: email,
              group: row.group_number.trim(),
              fullname: fullname ? fullname.trim() : null,
              discordId: discordId,
            });
          }
        } else {
          // Stary format
          email = row.email;
          fullname = row.fullname;
          discordId = row.discord_id;

          if (email) {
            usersCache.set(email.toLowerCase().trim(), {
              email: email,
              group: row.group_number.trim(),
              fullname: fullname ? fullname.trim() : null,
              discordId: discordId,
            });
          }
        }
      }

      lastCacheUpdate = Date.now();
      console.log(
        `[DB] Załadowano ${usersCache.size} użytkowników z MySQL${
          hasEncryptedColumns ? " (zaszyfrowane)" : " (niezaszyfrowane)"
        }`
      );
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("[DB] Błąd ładowania użytkowników z MySQL:", err.message);
    // Zachowaj stary cache jeśli błąd
  }
}

async function getUserByEmail(email) {
  if (!email) return null;

  // Odśwież cache jeśli jest stary
  if (Date.now() - lastCacheUpdate > CACHE_TTL) {
    await loadUsers();
  }

  const searchHash = generateSearchHash(email);
  let userData = usersCache.get(searchHash);

  // Fallback do starego systemu jeśli nie ma w nowym
  if (!userData) {
    userData = usersCache.get(email.trim().toLowerCase());
  }

  return userData || null;
}

async function getGroupByEmail(email) {
  const userData = await getUserByEmail(email);
  return userData ? userData.group : null;
}

async function getFullnameByEmail(email) {
  const userData = await getUserByEmail(email);
  return userData ? userData.fullname : null;
}

async function addUser(email, groupNumber, fullname = null, discordId = null) {
  try {
    const connection = await getConnection();

    try {
      // Sprawdź czy mamy nowe kolumny zaszyfrowane
      const [columns] = await connection.execute(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
      `);

      const columnNames = columns.map((col) => col.COLUMN_NAME);
      const hasEncryptedColumns = columnNames.includes("email_encrypted");

      if (hasEncryptedColumns) {
        // Nowy sposób - z szyfrowaniem
        const emailEncrypted = encryptData(email.trim().toLowerCase());
        const emailSearchHash = generateSearchHash(email.trim().toLowerCase());
        const fullnameEncrypted = fullname
          ? encryptData(fullname.trim())
          : null;
        const discordIdEncrypted = discordId
          ? encryptData(discordId.toString())
          : null;

        // Sprawdź czy jest stara kolumna email (NOT NULL)
        const hasOldEmailColumn = columnNames.find((col) => col === "email");

        if (hasOldEmailColumn) {
          // Tabela ma starą i nową strukturę - wypełnij obie
          await connection.execute(
            `INSERT INTO users (email, email_encrypted, email_search_hash, group_number, fullname, fullname_encrypted, discord_id, discord_id_encrypted) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?) 
             ON DUPLICATE KEY UPDATE 
             group_number = VALUES(group_number), 
             fullname = VALUES(fullname),
             fullname_encrypted = VALUES(fullname_encrypted), 
             discord_id = VALUES(discord_id),
             discord_id_encrypted = VALUES(discord_id_encrypted)`,
            [
              email.trim().toLowerCase(), // stara kolumna
              emailEncrypted,
              emailSearchHash,
              String(groupNumber).trim(),
              fullname ? fullname.trim() : null, // stara kolumna
              fullnameEncrypted,
              discordId, // stara kolumna
              discordIdEncrypted,
            ]
          );
        } else {
          // Tylko nowa struktura
          await connection.execute(
            `INSERT INTO users (email_encrypted, email_search_hash, group_number, fullname_encrypted, discord_id_encrypted) 
             VALUES (?, ?, ?, ?, ?) 
             ON DUPLICATE KEY UPDATE 
             group_number = VALUES(group_number), 
             fullname_encrypted = VALUES(fullname_encrypted), 
             discord_id_encrypted = VALUES(discord_id_encrypted)`,
            [
              emailEncrypted,
              emailSearchHash,
              String(groupNumber).trim(),
              fullnameEncrypted,
              discordIdEncrypted,
            ]
          );
        }
      } else {
        // Stary sposób - bez szyfrowania (wsteczna kompatybilność)
        await connection.execute(
          "INSERT INTO users (email, group_number, fullname, discord_id) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE group_number = VALUES(group_number), fullname = VALUES(fullname), discord_id = VALUES(discord_id)",
          [
            email.trim().toLowerCase(),
            String(groupNumber).trim(),
            fullname ? fullname.trim() : null,
            discordId,
          ]
        );
      }

      console.log(
        `[DB] Dodano/zaktualizowano użytkownika: ${email} -> grupa ${groupNumber}${
          discordId ? ` (Discord: ${discordId})` : ""
        }${hasEncryptedColumns ? " (zaszyfrowane)" : ""}`
      );

      // Odśwież cache
      await loadUsers();
      return true;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("[DB] Błąd dodawania użytkownika:", err.message);
    return false;
  }
}

async function importUsersFromText(textContent) {
  const lines = textContent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const results = {
    total: lines.length,
    added: 0,
    updated: 0,
    errors: [],
  };

  try {
    for (const line of lines) {
      try {
        const parts = line.split(";").map((part) => part.trim());

        if (parts.length !== 3) {
          results.errors.push(`Nieprawidłowy format linii: ${line}`);
          continue;
        }

        const [fullname, email, groupNumber] = parts;

        if (!email.includes("@")) {
          results.errors.push(`Nieprawidłowy email: ${email}`);
          continue;
        }

        if (isNaN(groupNumber) || groupNumber < 1) {
          results.errors.push(`Nieprawidłowy numer grupy: ${groupNumber}`);
          continue;
        }

        // Sprawdź czy użytkownik już istnieje (używając cache)
        const existingUser = await getUserByEmail(email);
        const userExists = existingUser !== null;

        // Użyj funkcji addUser, która obsługuje szyfrowanie i nową strukturę
        await addUser(email, groupNumber, fullname, null);

        if (userExists) {
          results.updated++;
        } else {
          results.added++;
        }
      } catch (lineError) {
        results.errors.push(`Błąd w linii "${line}": ${lineError.message}`);
      }
    }

    // Odśwież cache po wszystkich operacjach
    await loadUsers();
  } catch (error) {
    results.errors.push(`Ogólny błąd importu: ${error.message}`);
  }

  return results;
}

async function getUserCount() {
  try {
    const connection = await getConnection();

    try {
      const [rows] = await connection.execute(
        "SELECT COUNT(*) as count FROM users"
      );
      return rows[0].count;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("[DB] Błąd pobierania liczby użytkowników:", err.message);
    return 0;
  }
}

async function updateUserDiscordId(email, discordId) {
  try {
    const connection = await getConnection();

    try {
      // Sprawdź czy mamy nowe kolumny zaszyfrowane
      const [columns] = await connection.execute(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
      `);

      const columnNames = columns.map((col) => col.COLUMN_NAME);
      const hasEncryptedColumns = columnNames.includes("email_encrypted");

      let result;

      if (hasEncryptedColumns) {
        // Nowy sposób - z szyfrowaniem
        const emailSearchHash = generateSearchHash(email.trim().toLowerCase());
        const discordIdEncrypted = encryptData(discordId.toString());

        [result] = await connection.execute(
          "UPDATE users SET discord_id_encrypted = ? WHERE email_search_hash = ?",
          [discordIdEncrypted, emailSearchHash]
        );
      } else {
        // Stary sposób - bez szyfrowania
        [result] = await connection.execute(
          "UPDATE users SET discord_id = ? WHERE email = ?",
          [discordId, email.trim().toLowerCase()]
        );
      }

      if (result.affectedRows > 0) {
        console.log(
          `[DB] Zaktualizowano Discord ID dla ${email}: ${discordId}${
            hasEncryptedColumns ? " (zaszyfrowane)" : ""
          }`
        );
        // Odśwież cache
        await loadUsers();
        return true;
      } else {
        console.warn(
          `[DB] Nie znaleziono użytkownika do aktualizacji Discord ID: ${email}`
        );
        return false;
      }
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("[DB] Błąd aktualizacji Discord ID:", err.message);
    return false;
  }
}

async function getUserByDiscordId(discordId) {
  // Odśwież cache jeśli jest stary
  if (Date.now() - lastCacheUpdate > CACHE_TTL) {
    await loadUsers();
  }

  // Przeszukaj cache po Discord ID
  for (const [email, userData] of usersCache.entries()) {
    if (userData.discordId === discordId) {
      return { email, ...userData };
    }
  }

  return null;
}

module.exports = {
  getGroupByEmail,
  getFullnameByEmail,
  getUserByEmail,
  loadUsers,
  addUser,
  importUsersFromText,
  getUserCount,
  updateUserDiscordId,
  getUserByDiscordId,
};
