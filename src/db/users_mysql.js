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
        // Sprawdź które kolumny istnieją
        const hasIndeksEncrypted = columnNames.includes(
          "numer_indeksu_encrypted"
        );
        const hasSzkopulEncrypted = columnNames.includes(
          "szkopul_id_encrypted"
        );

        if (hasIndeksEncrypted) {
          [rows] = await connection.execute(
            "SELECT email_encrypted, email_search_hash, group_number, fullname_encrypted, discord_id_encrypted, numer_indeksu_encrypted, numer_indeksu_search_hash FROM users ORDER BY id"
          );
        } else if (hasSzkopulEncrypted) {
          // Fallback do starych kolumn szkopul
          [rows] = await connection.execute(
            "SELECT email_encrypted, email_search_hash, group_number, fullname_encrypted, discord_id_encrypted, szkopul_id_encrypted, szkopul_id_search_hash FROM users ORDER BY id"
          );
        } else {
          [rows] = await connection.execute(
            "SELECT email_encrypted, email_search_hash, group_number, fullname_encrypted, discord_id_encrypted FROM users ORDER BY id"
          );
        }
      } else {
        // Stary sposób - niezaszyfrowane kolumny (wsteczna kompatybilność)
        const hasIndeks = columnNames.includes("numer_indeksu");
        const hasSzkopul = columnNames.includes("szkopul_id");

        if (hasIndeks) {
          [rows] = await connection.execute(
            "SELECT email, group_number, fullname, discord_id, numer_indeksu FROM users ORDER BY id"
          );
        } else if (hasSzkopul) {
          // Fallback do starych kolumn szkopul
          [rows] = await connection.execute(
            "SELECT email, group_number, fullname, discord_id, szkopul_id FROM users ORDER BY id"
          );
        } else {
          [rows] = await connection.execute(
            "SELECT email, group_number, fullname, discord_id FROM users ORDER BY id"
          );
        }
      }

      usersCache.clear();

      for (const row of rows) {
        let email, fullname, discordId, numerIndeksu, szkopulId;

        if (hasEncryptedColumns) {
          // Odszyfruj dane
          email = decryptData(row.email_encrypted);
          fullname = row.fullname_encrypted
            ? decryptData(row.fullname_encrypted)
            : null;
          discordId = row.discord_id_encrypted
            ? decryptData(row.discord_id_encrypted)
            : null;

          // Preferuj numer_indeksu nad szkopul_id
          numerIndeksu = row.numer_indeksu_encrypted
            ? decryptData(row.numer_indeksu_encrypted)
            : null;
          szkopulId = row.szkopul_id_encrypted
            ? decryptData(row.szkopul_id_encrypted)
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
              numerIndeksu: numerIndeksu,
              szkopulId: szkopulId,
            });
          }
        } else {
          // Stary format
          email = row.email;
          fullname = row.fullname;
          discordId = row.discord_id;

          // Preferuj numer_indeksu nad szkopul_id
          numerIndeksu = row.numer_indeksu || null;
          szkopulId = row.szkopul_id || null;

          if (email) {
            usersCache.set(email.toLowerCase().trim(), {
              email: email,
              group: row.group_number.trim(),
              fullname: fullname ? fullname.trim() : null,
              discordId: discordId,
              numerIndeksu: numerIndeksu,
              szkopulId: szkopulId,
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

async function getSzkopulIdByEmail(email) {
  const userData = await getUserByEmail(email);
  return userData ? userData.szkopulId : null;
}

async function getNumerIndeksuByEmail(email) {
  const userData = await getUserByEmail(email);
  return userData ? userData.numerIndeksu : null;
}

async function addUser(
  email,
  groupNumber,
  fullname = null,
  discordId = null,
  numerIndeksu = null
) {
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
        const indeksEncrypted = numerIndeksu
          ? encryptData(numerIndeksu.toString())
          : null;
        const indeksSearchHash = numerIndeksu
          ? generateSearchHash(numerIndeksu.toString())
          : null;

        // Sprawdź czy jest stara kolumna email (NOT NULL)
        const hasOldEmailColumn = columnNames.find((col) => col === "email");
        const hasIndeksColumn = columnNames.includes("numer_indeksu");
        const hasEncryptedIndeksColumn = columnNames.includes(
          "numer_indeksu_encrypted"
        );

        if (hasOldEmailColumn) {
          // Tabela ma starą i nową strukturę - wypełnij obie
          let query, params;

          if (hasEncryptedIndeksColumn) {
            // Z zaszyfrowaną kolumną indeksu
            query = `INSERT INTO users (email, email_encrypted, email_search_hash, group_number, fullname, fullname_encrypted, discord_id, discord_id_encrypted, numer_indeksu_encrypted, numer_indeksu_search_hash) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
                     ON DUPLICATE KEY UPDATE 
                     group_number = VALUES(group_number), 
                     fullname = VALUES(fullname),
                     fullname_encrypted = VALUES(fullname_encrypted), 
                     discord_id = VALUES(discord_id),
                     discord_id_encrypted = VALUES(discord_id_encrypted),
                     numer_indeksu_encrypted = VALUES(numer_indeksu_encrypted),
                     numer_indeksu_search_hash = VALUES(numer_indeksu_search_hash)`;
            params = [
              email.trim().toLowerCase(), // stara kolumna
              emailEncrypted,
              emailSearchHash,
              String(groupNumber).trim(),
              fullname ? fullname.trim() : null, // stara kolumna
              fullnameEncrypted,
              discordId, // stara kolumna
              discordIdEncrypted,
              indeksEncrypted,
              indeksSearchHash,
            ];
          } else if (hasIndeksColumn) {
            // Z niezaszyfrowaną kolumną indeksu
            query = `INSERT INTO users (email, email_encrypted, email_search_hash, group_number, fullname, fullname_encrypted, discord_id, discord_id_encrypted, numer_indeksu) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) 
                     ON DUPLICATE KEY UPDATE 
                     group_number = VALUES(group_number), 
                     fullname = VALUES(fullname),
                     fullname_encrypted = VALUES(fullname_encrypted), 
                     discord_id = VALUES(discord_id),
                     discord_id_encrypted = VALUES(discord_id_encrypted),
                     numer_indeksu = VALUES(numer_indeksu)`;
            params = [
              email.trim().toLowerCase(), // stara kolumna
              emailEncrypted,
              emailSearchHash,
              String(groupNumber).trim(),
              fullname ? fullname.trim() : null, // stara kolumna
              fullnameEncrypted,
              discordId, // stara kolumna
              discordIdEncrypted,
              numerIndeksu,
            ];
          } else {
            // Bez kolumny indeksu (stary format)
            query = `INSERT INTO users (email, email_encrypted, email_search_hash, group_number, fullname, fullname_encrypted, discord_id, discord_id_encrypted) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?) 
                     ON DUPLICATE KEY UPDATE 
                     group_number = VALUES(group_number), 
                     fullname = VALUES(fullname),
                     fullname_encrypted = VALUES(fullname_encrypted), 
                     discord_id = VALUES(discord_id),
                     discord_id_encrypted = VALUES(discord_id_encrypted)`;
            params = [
              email.trim().toLowerCase(), // stara kolumna
              emailEncrypted,
              emailSearchHash,
              String(groupNumber).trim(),
              fullname ? fullname.trim() : null, // stara kolumna
              fullnameEncrypted,
              discordId, // stara kolumna
              discordIdEncrypted,
            ];
          }

          await connection.execute(query, params);
        } else {
          // Tylko nowa struktura
          let query, params;

          if (hasEncryptedIndeksColumn) {
            // Z zaszyfrowaną kolumną indeksu
            query = `INSERT INTO users (email_encrypted, email_search_hash, group_number, fullname_encrypted, discord_id_encrypted, numer_indeksu_encrypted, numer_indeksu_search_hash) 
                     VALUES (?, ?, ?, ?, ?, ?, ?) 
                     ON DUPLICATE KEY UPDATE 
                     group_number = VALUES(group_number), 
                     fullname_encrypted = VALUES(fullname_encrypted), 
                     discord_id_encrypted = VALUES(discord_id_encrypted),
                     numer_indeksu_encrypted = VALUES(numer_indeksu_encrypted),
                     numer_indeksu_search_hash = VALUES(numer_indeksu_search_hash)`;
            params = [
              emailEncrypted,
              emailSearchHash,
              String(groupNumber).trim(),
              fullnameEncrypted,
              discordIdEncrypted,
              indeksEncrypted,
              indeksSearchHash,
            ];
          } else {
            // Bez kolumny indeksu lub z niezaszyfrowaną
            query = `INSERT INTO users (email_encrypted, email_search_hash, group_number, fullname_encrypted, discord_id_encrypted) 
                     VALUES (?, ?, ?, ?, ?) 
                     ON DUPLICATE KEY UPDATE 
                     group_number = VALUES(group_number), 
                     fullname_encrypted = VALUES(fullname_encrypted), 
                     discord_id_encrypted = VALUES(discord_id_encrypted)`;
            params = [
              emailEncrypted,
              emailSearchHash,
              String(groupNumber).trim(),
              fullnameEncrypted,
              discordIdEncrypted,
            ];
          }

          await connection.execute(query, params);
        }
      } else {
        // Stary sposób - bez szyfrowania (wsteczna kompatybilność)
        const hasIndeksColumn = columnNames.includes("numer_indeksu");

        if (hasIndeksColumn) {
          // Z kolumną numer_indeksu
          await connection.execute(
            "INSERT INTO users (email, group_number, fullname, discord_id, numer_indeksu) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE group_number = VALUES(group_number), fullname = VALUES(fullname), discord_id = VALUES(discord_id), numer_indeksu = VALUES(numer_indeksu)",
            [
              email.trim().toLowerCase(),
              String(groupNumber).trim(),
              fullname ? fullname.trim() : null,
              discordId,
              numerIndeksu,
            ]
          );
        } else {
          // Bez kolumny numer_indeksu (stary format)
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
      }

      console.log(
        `[DB] Dodano/zaktualizowano użytkownika: ${email} -> grupa ${groupNumber}${
          discordId ? ` (Discord: ${discordId})` : ""
        }${numerIndeksu ? ` (Indeks: ${numerIndeksu})` : ""}${
          hasEncryptedColumns ? " (zaszyfrowane)" : ""
        }`
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

        if (parts.length !== 4) {
          results.errors.push(
            `Nieprawidłowy format linii (oczekiwano: Imię Nazwisko;email;grupa;numer_indeksu): ${line}`
          );
          continue;
        }

        const [fullname, email, groupNumber, numerIndeksu] = parts;

        if (!email.includes("@")) {
          results.errors.push(`Nieprawidłowy email: ${email}`);
          continue;
        }

        if (isNaN(groupNumber) || groupNumber < 1) {
          results.errors.push(`Nieprawidłowy numer grupy: ${groupNumber}`);
          continue;
        }

        // Walidacja numeru indeksu
        if (!numerIndeksu || !/^[A-Za-z0-9]+$/.test(numerIndeksu)) {
          results.errors.push(
            `Nieprawidłowy numer indeksu (tylko litery i cyfry): ${numerIndeksu}`
          );
          continue;
        }

        // Sprawdź czy użytkownik już istnieje (używając cache)
        const existingUser = await getUserByEmail(email);
        const userExists = existingUser !== null;

        // Użyj funkcji addUser z numerem indeksu
        await addUser(email, groupNumber, fullname, null, numerIndeksu);

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

async function updateUserGroup(email, newGroupNumber) {
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

        [result] = await connection.execute(
          "UPDATE users SET group_number = ? WHERE email_search_hash = ?",
          [String(newGroupNumber).trim(), emailSearchHash]
        );
      } else {
        // Stary sposób - bez szyfrowania
        [result] = await connection.execute(
          "UPDATE users SET group_number = ? WHERE email = ?",
          [String(newGroupNumber).trim(), email.trim().toLowerCase()]
        );
      }

      if (result.affectedRows > 0) {
        console.log(
          `[DB] Zaktualizowano grupę dla ${email}: ${newGroupNumber}${
            hasEncryptedColumns ? " (zaszyfrowane)" : ""
          }`
        );
        // Odśwież cache
        await loadUsers();
        return true;
      } else {
        console.warn(
          `[DB] Nie znaleziono użytkownika do aktualizacji grupy: ${email}`
        );
        return false;
      }
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("[DB] Błąd aktualizacji grupy użytkownika:", err.message);
    return false;
  }
}

async function updateUserSzkopulId(discordId, szkopulId) {
  try {
    const connection = await getConnection();

    try {
      // Sprawdź czy mamy nowe kolumny zaszyfrowane
      const [columns] = await connection.execute(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
      `);

      const columnNames = columns.map((col) => col.COLUMN_NAME);
      const hasEncryptedColumns = columnNames.includes("szkopul_id_encrypted");

      let result;

      if (hasEncryptedColumns) {
        // Nowy sposób - z szyfrowaniem
        // Najpierw znajdź użytkownika po Discord ID
        const [users] = await connection.execute(
          "SELECT id, discord_id_encrypted FROM users WHERE discord_id_encrypted IS NOT NULL"
        );

        let userIdToUpdate = null;
        for (const user of users) {
          try {
            const decryptedDiscordId = decryptData(user.discord_id_encrypted);
            if (decryptedDiscordId === discordId.toString()) {
              userIdToUpdate = user.id;
              break;
            }
          } catch (decryptError) {
            continue;
          }
        }

        if (userIdToUpdate) {
          const szkopulIdEncrypted = encryptData(szkopulId.toString());
          const szkopulIdSearchHash = generateSearchHash(szkopulId.toString());

          [result] = await connection.execute(
            "UPDATE users SET szkopul_id_encrypted = ?, szkopul_id_search_hash = ? WHERE id = ?",
            [szkopulIdEncrypted, szkopulIdSearchHash, userIdToUpdate]
          );
        } else {
          // Fallback do starego systemu
          if (columnNames.includes("discord_id")) {
            const szkopulIdEncrypted = szkopulId
              ? encryptData(szkopulId.toString())
              : null;
            const szkopulIdSearchHash = szkopulId
              ? generateSearchHash(szkopulId.toString())
              : null;

            [result] = await connection.execute(
              "UPDATE users SET szkopul_id_encrypted = ?, szkopul_id_search_hash = ? WHERE discord_id = ?",
              [szkopulIdEncrypted, szkopulIdSearchHash, discordId.toString()]
            );
          }
        }
      } else {
        // Stary sposób - bez szyfrowania
        [result] = await connection.execute(
          "UPDATE users SET szkopul_id = ? WHERE discord_id = ?",
          [szkopulId, discordId.toString()]
        );
      }

      if (result && result.affectedRows > 0) {
        console.log(
          `[DB] Zaktualizowano Szkopuł ID dla Discord ID ${discordId}: ${szkopulId}${
            hasEncryptedColumns ? " (zaszyfrowane)" : ""
          }`
        );
        // Odśwież cache
        await loadUsers();
        return true;
      } else {
        console.warn(
          `[DB] Nie znaleziono użytkownika do aktualizacji Szkopuł ID: Discord ${discordId}`
        );
        return false;
      }
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("[DB] Błąd aktualizacji Szkopuł ID:", err.message);
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

async function getSzkopulIdByDiscordId(discordId) {
  const userData = await getUserByDiscordId(discordId);
  return userData ? userData.szkopulId : null;
}

// Pobierz wszystkich użytkowników z określonej grupy
async function getUsersByGroup(groupNumber) {
  try {
    // Odśwież cache jeśli jest stary
    if (Date.now() - lastCacheUpdate > CACHE_TTL) {
      await loadUsers();
    }

    const usersInGroup = [];

    // Przejdź przez cache i znajdź wszystkich użytkowników z danej grupy
    for (const [key, userData] of usersCache.entries()) {
      if (
        userData.group &&
        parseInt(userData.group) === parseInt(groupNumber)
      ) {
        usersInGroup.push({
          email: userData.email,
          fullname: userData.fullname,
          group: userData.group,
          discordId: userData.discordId,
          numerIndeksu: userData.numerIndeksu,
          szkopulId: userData.szkopulId,
        });
      }
    }

    // Sortuj alfabetycznie po nazwisku
    usersInGroup.sort((a, b) => {
      const nameA = (a.fullname || "").toLowerCase();
      const nameB = (b.fullname || "").toLowerCase();
      return nameA.localeCompare(nameB, "pl");
    });

    return usersInGroup;
  } catch (error) {
    console.error("[DB] Błąd podczas pobierania użytkowników z grupy:", error);
    return [];
  }
}

// Pobierz wszystkich użytkowników
async function getAllUsers() {
  try {
    // Odśwież cache jeśli jest stary
    if (Date.now() - lastCacheUpdate > CACHE_TTL) {
      await loadUsers();
    }

    const allUsers = [];

    // Przejdź przez cache i zbierz wszystkich użytkowników
    for (const [key, userData] of usersCache.entries()) {
      allUsers.push({
        email: userData.email,
        name: userData.fullname, // używamy 'name' zamiast 'fullname' dla spójności
        fullname: userData.fullname,
        group_number: parseInt(userData.group) || null,
        group: parseInt(userData.group) || null, // dodaj też 'group' dla spójności
        discordId: userData.discordId, // Poprawna nazwa pola
        discord_id: userData.discordId, // Zachowaj też starą nazwę dla kompatybilności
        numerIndeksu: userData.numerIndeksu,
        szkopulId: userData.szkopulId,
        szkopul_id: userData.szkopulId,
      });
    }

    // Sortuj alfabetycznie po nazwisku
    allUsers.sort((a, b) => {
      const nameA = (a.fullname || "").toLowerCase();
      const nameB = (b.fullname || "").toLowerCase();
      return nameA.localeCompare(nameB, "pl");
    });

    return allUsers;
  } catch (error) {
    console.error(
      "[DB] Błąd podczas pobierania wszystkich użytkowników:",
      error
    );
    return [];
  }
}

// Usuń użytkownika na podstawie Discord ID
async function updateUserIndeks(email, numerIndeksu) {
  try {
    const connection = await getConnection();

    try {
      // Sprawdź czy mamy nowe kolumny zaszyfrowane
      const [columns] = await connection.execute(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
      `);

      const columnNames = columns.map((col) => col.COLUMN_NAME);
      const hasEncryptedColumns = columnNames.includes(
        "numer_indeksu_encrypted"
      );

      let result;

      if (hasEncryptedColumns) {
        // Nowy sposób - z szyfrowaniem
        // Znajdź użytkownika po email (zaszyfrowanym)
        const [users] = await connection.execute(
          "SELECT id, email_encrypted FROM users WHERE email_encrypted IS NOT NULL"
        );

        let userIdToUpdate = null;
        for (const user of users) {
          try {
            const decryptedEmail = decryptData(user.email_encrypted);
            if (decryptedEmail.toLowerCase() === email.toLowerCase()) {
              userIdToUpdate = user.id;
              break;
            }
          } catch (decryptError) {
            continue;
          }
        }

        if (userIdToUpdate) {
          const indeksEncrypted = encryptData(numerIndeksu.toString());
          const indeksSearchHash = generateSearchHash(numerIndeksu.toString());

          [result] = await connection.execute(
            "UPDATE users SET numer_indeksu_encrypted = ?, numer_indeksu_search_hash = ? WHERE id = ?",
            [indeksEncrypted, indeksSearchHash, userIdToUpdate]
          );
        } else {
          // Fallback do starego systemu
          if (columnNames.includes("email")) {
            const indeksEncrypted = numerIndeksu
              ? encryptData(numerIndeksu.toString())
              : null;
            const indeksSearchHash = numerIndeksu
              ? generateSearchHash(numerIndeksu.toString())
              : null;

            [result] = await connection.execute(
              "UPDATE users SET numer_indeksu_encrypted = ?, numer_indeksu_search_hash = ? WHERE LOWER(email) = LOWER(?)",
              [indeksEncrypted, indeksSearchHash, email]
            );
          }
        }
      } else {
        // Stary sposób - bez szyfrowania
        [result] = await connection.execute(
          "UPDATE users SET numer_indeksu = ? WHERE LOWER(email) = LOWER(?)",
          [numerIndeksu, email]
        );
      }

      if (result && result.affectedRows > 0) {
        console.log(
          `[DB] Zaktualizowano numer indeksu dla email ${email}: ${numerIndeksu}${
            hasEncryptedColumns ? " (zaszyfrowane)" : ""
          }`
        );

        // Odśwież cache
        await loadUsers();
        return true;
      } else {
        console.log(`[DB] Nie znaleziono użytkownika z emailem: ${email}`);
        return false;
      }
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("[DB] Błąd aktualizacji numeru indeksu:", error);
    throw error;
  }
}

async function removeUserByDiscordId(discordId) {
  try {
    const connection = await getConnection();

    try {
      // Sprawdź czy mamy nowe kolumny zaszyfrowane
      const [columns] = await connection.execute(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
      `);

      const columnNames = columns.map((col) => col.COLUMN_NAME);
      const hasEncryptedColumns = columnNames.includes("discord_id_encrypted");

      let deletedRows = 0;

      if (hasEncryptedColumns) {
        // Nowy sposób - z szyfrowaniem
        // Znajdź użytkownika po zaszyfrowanym Discord ID
        const [users] = await connection.execute(
          "SELECT id, discord_id_encrypted FROM users WHERE discord_id_encrypted IS NOT NULL"
        );

        let userIdToDelete = null;
        for (const user of users) {
          try {
            const decryptedDiscordId = decryptData(user.discord_id_encrypted);
            if (decryptedDiscordId === discordId.toString()) {
              userIdToDelete = user.id;
              break;
            }
          } catch (decryptError) {
            // Ignoruj błędy deszyfrowania - może to być stary rekord
            continue;
          }
        }

        if (userIdToDelete) {
          const [result] = await connection.execute(
            "DELETE FROM users WHERE id = ?",
            [userIdToDelete]
          );
          deletedRows = result.affectedRows;
        }

        // Sprawdź także stare kolumny dla wstecznej kompatybilności
        if (deletedRows === 0 && columnNames.includes("discord_id")) {
          const [result] = await connection.execute(
            "DELETE FROM users WHERE discord_id = ?",
            [discordId.toString()]
          );
          deletedRows = result.affectedRows;
        }
      } else {
        // Stary sposób - bez szyfrowania
        const [result] = await connection.execute(
          "DELETE FROM users WHERE discord_id = ?",
          [discordId.toString()]
        );
        deletedRows = result.affectedRows;
      }

      if (deletedRows > 0) {
        console.log(`[DB] Usunięto użytkownika z Discord ID: ${discordId}`);

        // Odśwież cache po usunięciu
        await loadUsers();

        return true;
      } else {
        console.log(
          `[DB] Nie znaleziono użytkownika z Discord ID: ${discordId}`
        );
        return false;
      }
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("[DB] Błąd podczas usuwania użytkownika:", error);
    return false;
  }
}

module.exports = {
  getGroupByEmail,
  getFullnameByEmail,
  getUserByEmail,
  getSzkopulIdByEmail,
  getNumerIndeksuByEmail,
  getSzkopulIdByDiscordId,
  loadUsers,
  addUser,
  importUsersFromText,
  getUserCount,
  updateUserDiscordId,
  updateUserSzkopulId,
  getUserByDiscordId,
  getUsersByGroup,
  getAllUsers,
  updateUserGroup,
  removeUserByDiscordId,
  updateUserIndeks,
};
