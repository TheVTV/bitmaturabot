const { EmbedBuilder } = require("discord.js");
const { getUserByDiscordId, getAllUsers } = require("../db/users_mysql");
const { getSheetsCache } = require("../scripts/import-points-from-sheets");
const { getPersonalThread } = require("../db/threads");
const { getAllTeachers } = require("../db/teachers");
const { getConnection } = require("../db/database");
const {
  encryptData,
  decryptData,
  generateSearchHash,
} = require("../crypto/encryption");

// Cache powiadomień, żeby nie wysyłać wielokrotnie
const notificationCache = new Map();

/**
 * Znajduje użytkownika w arkuszu na podstawie numeru indeksu
 */
function findUserInSheet(sheetData, numerIndeksu) {
  if (!sheetData || !numerIndeksu) {
    return -1;
  }

  for (let i = 0; i < sheetData.length; i++) {
    const row = sheetData[i];
    if (row && row[1]) {
      // kolumna C (indeks 1) zawiera numer_indeksu
      const sheetIndex = String(row[1]).trim();
      const searchIndex = String(numerIndeksu).trim();

      if (sheetIndex === searchIndex) {
        return i;
      }
    }
  }

  return -1;
}

/**
 * Analizuje nieobecności z arkusza (podobnie jak w profil.js)
 */
function analyzeAttendance(sheetData, userRowIndex) {
  const attendance = {
    absentUnexcused: 0,
    absentExcused: 0,
    excused: 0, // zwolnieni (zw) - nie liczą się do limitów
    totalAbsences: 0,
    unexpcusedDates: [],
    excusedDates: [],
    excusedFromClass: [], // daty zwolnień
  };

  if (!sheetData || !sheetData[userRowIndex]) {
    return attendance;
  }

  const userRow = sheetData[userRowIndex];
  const dateRow = sheetData[19]; // wiersz 21 (indeks 19) zawiera daty

  // Kolumny E do AI (indeksy 4 do 34)
  for (let colIndex = 4; colIndex <= 34; colIndex++) {
    const cellValue = userRow[colIndex];
    const dateValue = dateRow ? dateRow[colIndex] : null;

    if (cellValue !== undefined && cellValue !== null && cellValue !== "") {
      const cellStr = String(cellValue).toLowerCase().trim();

      if (cellStr === "n") {
        attendance.absentUnexcused++;
        if (dateValue) {
          attendance.unexpcusedDates.push(dateValue);
        }
      } else if (cellStr === "u") {
        attendance.absentExcused++;
        if (dateValue) {
          attendance.excusedDates.push(dateValue);
        }
      } else if (cellStr === "zw") {
        attendance.excused++;
        if (dateValue) {
          attendance.excusedFromClass.push(dateValue);
        }
        // "zw" (zwolniony) nie liczy się do nieobecności - pomijamy w obliczeniach limitów
      }
    }
  }

  attendance.totalAbsences =
    attendance.absentUnexcused + attendance.absentExcused;

  return attendance;
}

/**
 * Sprawdza czy użytkownik osiągnął lub zbliża się do limitów nieobecności
 */
function checkAttendanceLimits(attendance) {
  const limits = {
    maxUnexcused: 4, // alert od 4 nieusprawiedliwionych (przekroczenie 3)
    maxTotal: 9, // alert od 9 łącznych (przekroczenie 8)
    warningThreshold: 1, // ostrzeżenie gdy zostaje 1 nieobecność do limitu
  };

  const status = {
    exceedsUnexcused: attendance.absentUnexcused >= limits.maxUnexcused,
    exceedsTotal: attendance.totalAbsences >= limits.maxTotal,
    warningUnexcused: attendance.absentUnexcused >= limits.maxUnexcused - 1, // ostrzeżenie od 3 nieusprawiedliwionych
    warningTotal: attendance.totalAbsences >= limits.maxTotal - 1, // ostrzeżenie od 8 łącznych
    needsAction: false,
    type: null,
    message: "",
  };

  if (status.exceedsUnexcused || status.exceedsTotal) {
    status.needsAction = true;
    status.type = "EXCEEDED";

    if (status.exceedsUnexcused && status.exceedsTotal) {
      status.message = `Przekroczono oba limity: ${attendance.absentUnexcused} nieusprawiedliwionych (limit: 3) i ${attendance.totalAbsences} łącznie (limit: 8)`;
    } else if (status.exceedsUnexcused) {
      status.message = `Przekroczono limit nieusprawiedliwionych nieobecności: ${attendance.absentUnexcused}/3`;
    } else {
      status.message = `Przekroczono limit łącznych nieobecności: ${attendance.totalAbsences}/8`;
    }
  } else if (status.warningUnexcused || status.warningTotal) {
    status.needsAction = true;
    status.type = "WARNING";

    if (status.warningUnexcused && status.warningTotal) {
      status.message = `Zbliżasz się do limitów: ${attendance.absentUnexcused}/3 nieusprawiedliwionych i ${attendance.totalAbsences}/8 łącznie`;
    } else if (status.warningUnexcused) {
      status.message = `Zbliżasz się do limitu nieusprawiedliwionych: ${attendance.absentUnexcused}/3`;
    } else {
      status.message = `Zbliżasz się do limitu łącznych nieobecności: ${attendance.totalAbsences}/8`;
    }
  }

  return status;
}

/**
 * Zapisuje informację o wysłanym powiadomieniu
 */
async function saveNotificationRecord(studentDiscordId, notificationType) {
  await ensureNotificationsTable();
  const connection = await getConnection();

  try {
    await connection.execute(
      `INSERT INTO absence_notifications (student_discord_id, notification_type, created_at) 
       VALUES (?, ?, CURRENT_TIMESTAMP)`,
      [studentDiscordId, notificationType]
    );
  } finally {
    connection.release();
  }
}

/**
 * Sprawdza czy powiadomienie już było wysyłane
 */
async function wasNotificationSent(studentDiscordId, notificationType) {
  await ensureNotificationsTable();
  const connection = await getConnection();

  try {
    // Sprawdź czy już wysłano powiadomienie tego typu dla tego użytkownika dziś
    const [rows] = await connection.execute(
      `SELECT id FROM absence_notifications 
       WHERE student_discord_id = ? 
       AND notification_type = ?`,
      [studentDiscordId, notificationType]
    );

    return rows.length > 0;
  } finally {
    connection.release();
  }
}

/**
 * Tworzy tabelę powiadomień jeśli nie istnieje
 */
async function ensureNotificationsTable() {
  const connection = await getConnection();

  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS absence_notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_discord_id VARCHAR(20) NOT NULL,
        notification_type VARCHAR(10) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_student_type (student_discord_id, notification_type),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } finally {
    connection.release();
  }
}

/**
 * Wysyła powiadomienia o przekroczeniu lub zbliżaniu się do limitów
 */
async function sendAttendanceNotifications(
  client,
  studentDiscordId,
  limitStatus,
  attendance,
  isMockTesting = false
) {
  try {
    const studentData = await getUserByDiscordId(studentDiscordId);
    if (!studentData) {
      throw new Error(`Nie znaleziono danych studenta ${studentDiscordId}`);
    }

    const guild = client.guilds.cache.first();
    if (!guild) {
      throw new Error("Nie znaleziono serwera Discord");
    }

    // Znajdź wątek osobisty ucznia
    const personalThread = await getPersonalThread(guild.id, studentDiscordId);
    let threadChannel = null;

    if (personalThread) {
      try {
        threadChannel = await guild.channels.fetch(personalThread.thread_id);
      } catch (error) {
        // Błąd pobrania wątku - loguj tylko błąd
      }
    }

    // Znajdź nauczyciela grupy
    const teachers = await getAllTeachers();

    const groupTeacher = teachers.find(
      (t) => t.group_number == studentData.group
    );
    const student = await guild.members
      .fetch(studentDiscordId)
      .catch(() => null);

    if (limitStatus.type === "EXCEEDED") {
      // Przekroczono limit - powiadom adminów, nauczyciela i ucznia
      const { getAdminRoleName } = require("../db/config_mysql");
      const adminRoleName = await getAdminRoleName(guild.id);

      // Pobierz wszystkich członków serwera dla lepszego dostępu do ról
      if (!isMockTesting) {
        try {
          await guild.members.fetch();
        } catch (error) {
          // Błąd pobrania członków
        }
      }

      const adminRole = guild.roles.cache.find(
        (role) => role.name.toLowerCase() === adminRoleName.toLowerCase()
      );

      if (threadChannel) {
        const embed = new EmbedBuilder()
          .setTitle("🚨 PRZEKROCZONO LIMIT NIEOBECNOŚCI")
          .setDescription(
            `**Uczeń:** ${studentData.fullname}\n` +
              `**Grupa:** ${studentData.group}\n\n` +
              `**Status:** ${limitStatus.message}\n\n` +
              `**Nieusprawiedliwione:** ${
                attendance.absentUnexcused
              } (${attendance.unexpcusedDates.join(", ")})\n` +
              `**Usprawiedliwione:** ${
                attendance.absentExcused
              } (${attendance.excusedDates.join(", ")})\n` +
              `**Łącznie:** ${attendance.totalAbsences}\n\n` +
              `${
                student ? `<@${studentDiscordId}>` : studentData.fullname
              }, sprawa została przekazana do koordynatorów.`
          )
          .setColor("#FF0000")
          .setTimestamp();

        // Ping adminów, nauczyciela i ucznia
        let mentions = "";
        if (student) mentions += `<@${studentDiscordId}> `;
        if (groupTeacher && groupTeacher.discord_id)
          mentions += `<@${groupTeacher.discord_id}> `;
        if (adminRole) {
          mentions += `<@&${adminRole.id}>`;
        }

        await threadChannel.send({
          content: mentions,
          embeds: [embed],
        });
      }

      // Wyślij DM do adminów
      if (adminRole) {
        const adminEmbed = new EmbedBuilder()
          .setTitle("🚨 Alert: Przekroczono limit nieobecności")
          .setDescription(
            `**Uczeń:** ${studentData.fullname} (${studentData.group})\n` +
              `${limitStatus.message}\n\n` +
              `${
                threadChannel
                  ? `**Wątek:** ${threadChannel}\n`
                  : "**Wątek:** Nie znaleziono\n"
              }` +
              `**Discord:** <@${studentDiscordId}>`
          )
          .setColor("#FF0000")
          .setTimestamp();

        let successCount = 0;
        let errorCount = 0;

        for (const member of adminRole.members.values()) {
          try {
            await member.send({ embeds: [adminEmbed] });
            successCount++;
          } catch (error) {
            errorCount++;
          }
        }
      }

      // Wyślij DM do ucznia
      if (student) {
        const studentEmbed = new EmbedBuilder()
          .setTitle("⚠️ Przekroczono limit nieobecności")
          .setDescription(
            `${limitStatus.message}\n\n` +
              `Sprawa została przekazana do koordynatorów.`
          )
          .setColor("#FF0000")
          .setTimestamp();

        try {
          await student.send({ embeds: [studentEmbed] });
        } catch (error) {
          console.log(`Nie można wysłać DM do ucznia: ${studentData.fullname}`);
        }
      }
    } else if (limitStatus.type === "WARNING") {
      // Ostrzeżenie - powiadom tylko ucznia (nie adminów!)

      if (threadChannel) {
        const embed = new EmbedBuilder()
          .setTitle("⚠️ Ostrzeżenie o zbliżającym się limicie")
          .setDescription(
            `**Uczeń:** ${studentData.fullname}\n` +
              `**Grupa:** ${studentData.group}\n\n` +
              `**Status:** ${limitStatus.message}\n\n` +
              `**Nieusprawiedliwione:** ${attendance.absentUnexcused}/3\n` +
              `**Łącznie:** ${attendance.totalAbsences}/8\n\n` +
              `Kolejna nieobecność spowoduje przekroczenie limitu!`
          )
          .setColor("#FFA500")
          .setTimestamp();

        // Ping tylko ucznia (nie adminów!)
        let mentions = "";
        if (student) mentions += `<@${studentDiscordId}> `;
        if (groupTeacher && groupTeacher.discord_id)
          mentions += `<@${groupTeacher.discord_id}> `;

        await threadChannel.send({
          content: mentions,
          embeds: [embed],
        });
      }

      // Wyślij DM do ucznia
      if (student) {
        const studentEmbed = new EmbedBuilder()
          .setTitle("⚠️ Ostrzeżenie o zbliżającym się limicie")
          .setDescription(
            `${limitStatus.message}\n\n` + `Uważaj na kolejne nieobecności!`
          )
          .setColor("#FFA500")
          .setTimestamp();

        try {
          await student.send({ embeds: [studentEmbed] });
        } catch (error) {
          console.log(`Nie można wysłać DM do ucznia: ${studentData.fullname}`);
        }
      }
    }

    // Zapisz informację o wysłanym powiadomieniu
    await saveNotificationRecord(studentDiscordId, limitStatus.type);
  } catch (error) {
    console.error(
      "[ATTENDANCE-MONITOR] Błąd podczas wysyłania powiadomień:",
      error
    );
  }
}

/**
 * Sprawdza limity nieobecności dla wszystkich uczniów
 */
async function checkAllStudentsAttendance(client) {
  try {
    console.log("[ATTENDANCE-MONITOR] Sprawdzanie limitów nieobecności...");

    let sheetsCache = getSheetsCache();

    // Sprawdź czy cache jest pusty i załaduj arkusze jeśli potrzeba
    if (Object.keys(sheetsCache).length === 0) {
      console.log(
        "[ATTENDANCE-MONITOR] ⚠️ Cache arkuszy jest pusty, ładuję dane z Google Sheets..."
      );

      try {
        const {
          fetchAllSheets,
        } = require("../scripts/import-points-from-sheets");
        await fetchAllSheets();
        sheetsCache = getSheetsCache();

        if (Object.keys(sheetsCache).length > 0) {
          console.log(
            `[ATTENDANCE-MONITOR] ✅ Załadowano ${
              Object.keys(sheetsCache).length
            } arkuszy`
          );
        } else {
          console.log(
            "[ATTENDANCE-MONITOR] ❌ Nie udało się załadować arkuszy - przerywam"
          );
          return;
        }
      } catch (loadError) {
        console.error(
          "[ATTENDANCE-MONITOR] ❌ Błąd ładowania arkuszy:",
          loadError.message
        );
        return;
      }
    }

    const allUsers = await getAllUsers();

    let checkedStudents = 0;
    let warningsCount = 0;
    let exceededCount = 0;
    let notificationsSent = 0;
    let notificationsSkipped = 0;
    let errors = [];

    for (const user of allUsers) {
      if (!user.numerIndeksu || !user.group) {
        continue;
      }

      const sheetName = `Grupa${user.group}`;
      const sheetData = sheetsCache[sheetName];

      if (!sheetData || sheetData.length === 0) {
        continue;
      }

      const userRowIndex = findUserInSheet(sheetData, user.numerIndeksu);
      if (userRowIndex === -1) {
        continue;
      }

      const attendance = analyzeAttendance(sheetData, userRowIndex);
      const limitStatus = checkAttendanceLimits(attendance);

      checkedStudents++;

      if (limitStatus.needsAction) {
        // Zlicz typy problemów
        if (limitStatus.type === "WARNING") {
          warningsCount++;
        } else if (limitStatus.type === "EXCEEDED") {
          exceededCount++;
        }

        if (user.discord_id) {
          try {
            // Sprawdź czy powiadomienie już było wysyłane
            const alreadySent = await wasNotificationSent(
              user.discord_id,
              limitStatus.type
            );
            if (alreadySent) {
              notificationsSkipped++;
            } else {
              await sendAttendanceNotifications(
                client,
                user.discord_id,
                limitStatus,
                attendance,
                false
              );
              notificationsSent++;
            }
          } catch (error) {
            errors.push({
              user: user.fullname,
              error: error.message,
            });
          }
        } else {
          errors.push({
            user: user.fullname,
            error: "Brak Discord ID",
          });
        }
      }
    }

    // Podsumowanie
    let report = `[ATTENDANCE-MONITOR] Sprawdzono ${checkedStudents} uczniów\n`;
    report += `[ATTENDANCE-MONITOR] Ostrzeżenia: ${warningsCount}, Przekroczenia: ${exceededCount}\n`;
    report += `[ATTENDANCE-MONITOR] Powiadomienia wysłane: ${notificationsSent}, Pominięte (już wysłane): ${notificationsSkipped}`;

    if (errors.length > 0) {
      report += `\n[ATTENDANCE-MONITOR] Błędy (${errors.length}):`;
      errors.forEach((err) => {
        report += `\n  - ${err.user}: ${err.error}`;
      });
    }

    console.log(report);
  } catch (error) {
    console.error(
      "[ATTENDANCE-MONITOR] Błąd podczas sprawdzania nieobecności:",
      error
    );
  }
}

module.exports = {
  checkAllStudentsAttendance,
  sendAttendanceNotifications,
  checkAttendanceLimits,
  analyzeAttendance,
  findUserInSheet,
};
