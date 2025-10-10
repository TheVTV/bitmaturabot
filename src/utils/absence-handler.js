const {
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");
const {
  getUserByDiscordId,
  getNumerIndeksuByEmail,
} = require("../db/users_mysql");
const { getAllTeachers } = require("../db/teachers");
const { checkUserPermissions } = require("./permissions");
const { validateAbsenceDateFromFields } = require("./date-validator");
const { writeAbsenceToSheet } = require("./sheets-manager");

// Mapa aktywnych wątków nieobecności: threadId -> dane zgłoszenia
const activeAbsenceThreads = new Map();

/**
 * Obsługuje przesłanie formularza zgłoszenia nieobecności
 */
async function handleAbsenceReportModal(interaction) {
  const reason = interaction.fields.getTextInputValue("absence_reason");
  const day = interaction.fields.getTextInputValue("absence_day");
  const month = interaction.fields.getTextInputValue("absence_month");
  const year = interaction.fields.getTextInputValue("absence_year");

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    // Sprawdź czy użytkownik ma rolę ucznia (pierwsza rzecz do sprawdzenia)
    const hasStudentRole = interaction.member.roles.cache.some(
      (role) => role.name.toLowerCase() === "uczeń"
    );

    if (!hasStudentRole) {
      await interaction.editReply({
        content: "❌ Tylko uczniowie mogą zgłaszać nieobecności.",
      });
      return;
    }

    // Sprawdź uprawnienia użytkownika (pełne sprawdzenie)
    const permissions = await checkUserPermissions(
      interaction,
      "zgłoś-nieobecność"
    );
    if (!permissions.canUseCommand) {
      await interaction.editReply({
        content: `❌ **Brak dostępu:** ${permissions.reason}`,
      });
      return;
    }

    // Pobierz dane użytkownika
    const userData = await getUserByDiscordId(interaction.user.id);
    if (!userData) {
      await interaction.editReply({
        content:
          "❌ Nie jesteś zarejestrowany w systemie. Użyj `/rejestruj` aby się zarejestrować.",
      });
      return;
    }

    // Walidacja daty nieobecności z trzech pól
    const dateValidation = await validateAbsenceDateFromFields(
      day,
      month,
      year,
      userData.group
    );

    if (!dateValidation.isValid) {
      await interaction.editReply({
        content: `❌ ${dateValidation.error}`,
      });
      return;
    }

    if (!dateValidation.isInFuture) {
      await interaction.editReply({
        content: `❌ Nie można zgłosić nieobecności na datę z przeszłości (${dateValidation.inputDate}). Nieobecność można zgłosić tylko na dzisiaj lub przyszłe dni.`,
      });
      return;
    }

    if (!dateValidation.hasClasses) {
      let responseMessage;

      if (dateValidation.error) {
        // Błąd systemowy - nie można pobrać danych z arkusza
        responseMessage = `❌ ${dateValidation.error}`;
      } else {
        // Brak zajęć na podaną datę
        responseMessage = `❌ Nie ma ćwiczeń o dacie ${dateValidation.inputDate}.`;

        if (dateValidation.nearestDates.length > 0) {
          responseMessage += `\n\n📅 **Najbliższe daty z ćwiczeniami:**\n${dateValidation.nearestDates
            .map((d) => `• ${d}`)
            .join("\n")}`;
        } else {
          responseMessage += `\n\nBrak zaplanowanych ćwiczeń dla grupy ${userData.group}.`;
        }
      }

      await interaction.editReply({
        content: responseMessage,
      });
      return;
    }

    // Znajdź prowadzącego grupy
    const teachers = await getAllTeachers();
    const teacher = teachers.find((t) => t.group_number == userData.group);

    if (!teacher) {
      await interaction.editReply({
        content: "❌ Nie znaleziono prowadzącego dla Twojej grupy.",
      });
      return;
    }

    // Sprawdź czy prowadzący istnieje na serwerze
    const teacherMember = await interaction.guild.members
      .fetch(teacher.discord_id)
      .catch(() => null);
    if (!teacherMember) {
      await interaction.editReply({
        content:
          "❌ Prowadzący nie jest dostępny na serwerze. Skontaktuj się z administratorem.",
      });
      return;
    }

    // Utwórz prywatny wątek bezpośrednio w kanale gdzie została wywołana komenda (tak jak w rejestracji)
    const threadName = `Nieobecność - ${
      userData.fullname || interaction.user.displayName
    } (Grupa ${userData.group})`;

    const thread = await interaction.channel.threads.create({
      name: threadName,
      type: ChannelType.PrivateThread,
      invitable: false,
      reason: "Zgłoszenie nieobecności ucznia",
    });

    // Dodaj użytkownika i prowadzącego do wątku (tak jak w rejestracji)
    await thread.members.add(interaction.user.id);
    await thread.members.add(teacher.discord_id);

    // Dodaj informacje o wątku do mapy aktywnych (klucz: threadId)
    activeAbsenceThreads.set(thread.id, {
      threadId: thread.id,
      teacherId: teacher.discord_id,
      studentId: interaction.user.id,
      startTime: Date.now(),
      group: userData.group,
      studentFullName: userData.fullname || interaction.user.displayName,
      absenceDate: dateValidation.inputDate,
      reason: reason,
    });

    // Utwórz embed z informacjami o zgłoszeniu
    const embed = new EmbedBuilder()
      .setTitle("📋 Zgłoszenie nieobecności")
      .setColor(0xffa500)
      .addFields(
        {
          name: "👤 Uczeń",
          value: `<@${interaction.user.id}> (${
            userData.fullname || interaction.user.displayName
          })`,
          inline: true,
        },
        { name: "📚 Grupa", value: userData.group, inline: true },
        { name: "📅 Data", value: dateValidation.inputDate, inline: true },
        { name: "📝 Powód nieobecności", value: reason, inline: false }
      )
      .setTimestamp()
      .setFooter({
        text: "Prowadzący może odpowiedzieć 'Potwierdzam usprawiedliwienie' lub użyć komendy /potwierdź-usprawiedliwienie",
      });

    // Wyślij wiadomość w prywatnym wątku
    await thread.send({
      content: `🔔 <@${teacher.discord_id}> - zgłoszenie nieobecności do rozpatrzenia`,
      embeds: [embed],
    });

    // Odpowiedz użytkownikowi
    await interaction.editReply({
      content: `✅ Zgłoszenie nieobecności zostało przesłane. Utworzono prywatny wątek: <#${thread.id}>`,
    });

    // Nasłuchuj na wiadomości w wątku lub opuszczenie wątku przez prowadzącego
    setupThreadMonitoring(thread, teacher.discord_id, interaction.user.id);
  } catch (error) {
    console.error("Błąd podczas tworzenia zgłoszenia nieobecności:", error);

    // Sprawdź typ błędu i wyślij odpowiedni komunikat
    let errorMessage = "❌ Wystąpił błąd podczas tworzenia zgłoszenia.";

    if (
      error.code === "ECONNRESET" ||
      error.code === "ENOTFOUND" ||
      error.code === "ETIMEDOUT"
    ) {
      errorMessage =
        "❌ Problem z połączeniem do bazy danych. Spróbuj ponownie za chwilę.";
    } else if (error.code === 50001) {
      errorMessage =
        "❌ Bot nie ma wystarczających uprawnień do utworzenia wątku. Skontaktuj się z administratorem.";
    } else if (error.code === 50013) {
      errorMessage =
        "❌ Brak uprawnień do wykonania tej operacji. Skontaktuj się z administratorem.";
    } else if (error.message && error.message.includes("interaction")) {
      errorMessage = "❌ Sesja wygasła. Spróbuj ponownie.";
    }

    try {
      await interaction.editReply({
        content: errorMessage,
      });
    } catch (replyError) {
      console.error("Nie można wysłać komunikatu o błędzie:", replyError);
    }
  }
}

/**
 * Konfiguruje monitorowanie wątku nieobecności
 */
function setupThreadMonitoring(thread, teacherId, studentId) {
  const client = thread.client;

  // Obsługa wiadomości w wątku
  const messageHandler = async (message) => {
    if (message.channel.id !== thread.id) return;
    if (message.author.bot) return;

    // Sprawdź czy prowadzący pisze wiadomość o potwierdzeniu usprawiedliwienia
    if (message.author.id === teacherId) {
      const content = message.content.toLowerCase();
      if (
        content.includes("potwierdzam usprawiedliwienie") ||
        content.includes("usprawiedliwione")
      ) {
        await handleAbsenceApproval(thread, teacherId, studentId, message);
        return;
      }
    }
  };

  // Obsługa usuwania członków z wątku (dla prywatnych wątków)
  const threadMembersUpdateHandler = async (oldMembers, newMembers) => {
    // Sprawdź czy prowadzący opuścił wątek
    if (oldMembers.has(teacherId) && !newMembers.has(teacherId)) {
      await handleThreadClosed(thread, teacherId, studentId);
    }
  };

  client.on("messageCreate", messageHandler);
  client.on("threadMembersUpdate", threadMembersUpdateHandler);

  // Usuń nasłuchiwacze po 24 godzinach (zabezpieczenie)
  setTimeout(() => {
    client.off("messageCreate", messageHandler);
    client.off("threadMembersUpdate", threadMembersUpdateHandler);

    // Usuń z aktywnych jeśli nadal istnieje
    if (activeAbsenceThreads.has(thread.id)) {
      activeAbsenceThreads.delete(thread.id);
    }
  }, 24 * 60 * 60 * 1000); // 24 godziny
}

/**
 * Obsługuje potwierdzenie usprawiedliwienia przez prowadzącego
 */
async function handleAbsenceApproval(
  thread,
  teacherId,
  studentId,
  approvalMessage
) {
  try {
    // Pobierz dane zgłoszenia na podstawie threadId
    let threadData = activeAbsenceThreads.get(thread.id);

    // Jeśli nie ma danych (np. po restarcie bota), spróbuj odzyskać z wątku
    if (!threadData) {
      console.log(`Próba odzyskania danych zgłoszenia z wątku ${thread.id}`);
      threadData = await recoverAbsenceDataFromThread(thread);

      if (threadData) {
        // Przywróć dane do mapy
        activeAbsenceThreads.set(thread.id, threadData);
        console.log(`Odzyskano dane zgłoszenia dla wątku ${thread.id}`);
      }
    }

    if (!threadData) {
      console.error(
        `Nie można znaleźć ani odzyskać danych ucznia dla wątku ${thread.id}`
      );

      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Błąd")
        .setColor(0xff0000)
        .setDescription(
          "Nie można znaleźć danych zgłoszenia dla tego wątku. Możliwe przyczyny:\n• Bot został zrestartowany\n• Wątek już został obsłużony\n• Błąd systemu\n\nSpróbuj ponownie lub skontaktuj się z administratorem."
        )
        .addFields({
          name: "🔍 Diagnostyka",
          value: `Thread ID: ${thread.id}\nTeacher ID: ${teacherId}\nAktywne wątki: ${activeAbsenceThreads.size}`,
        })
        .setTimestamp();

      await thread.send({ embeds: [errorEmbed] });
      return;
    }

    // Oznacz jako zatwierdzone
    threadData.approvedByTeacher = true;

    // Zapisz usprawiedliwienie w arkuszu Google Sheets
    let sheetResult = null;
    if (
      threadData.studentFullName &&
      threadData.absenceDate &&
      threadData.group
    ) {
      try {
        // Pobierz dane użytkownika, żeby uzyskać email i numer indeksu
        const userData = await getUserByDiscordId(threadData.studentId);
        if (userData && userData.email) {
          const numerIndeksu = await getNumerIndeksuByEmail(userData.email);

          // Wyodrębnij imię z fullname (pierwsze słowo)
          const studentName = threadData.studentFullName.split(" ")[0];

          if (numerIndeksu) {
            sheetResult = await writeAbsenceToSheet(
              threadData.group,
              studentName,
              numerIndeksu,
              threadData.absenceDate
            );
          } else {
            console.warn(
              "Nie znaleziono numeru indeksu dla użytkownika:",
              userData.email
            );
            // Fallback - spróbuj ze starą metodą
            sheetResult = await writeAbsenceToSheet(
              threadData.group,
              threadData.studentFullName,
              threadData.absenceDate
            );
          }
        } else {
          console.warn(
            "Nie znaleziono danych użytkownika dla Discord ID:",
            threadData.studentId
          );
          // Fallback - spróbuj ze starą metodą
          sheetResult = await writeAbsenceToSheet(
            threadData.group,
            threadData.studentFullName,
            threadData.absenceDate
          );
        }
      } catch (sheetError) {
        console.error(
          "Błąd podczas zapisywania usprawiedliwienia w arkuszu:",
          sheetError
        );
      }
    }

    // Utwórz embed z potwierdzeniem
    const embed = new EmbedBuilder()
      .setTitle("✅ Usprawiedliwienie potwierdzone")
      .setColor(0x00ff00)
      .setDescription("Prowadzący potwierdził usprawiedliwienie nieobecności.")
      .addFields(
        { name: "👤 Uczeń", value: threadData.studentFullName, inline: true },
        { name: "📅 Data", value: threadData.absenceDate, inline: true },
        { name: "📚 Grupa", value: threadData.group.toString(), inline: true }
      )
      .setTimestamp();

    // Dodaj informację o zapisie w arkuszu
    if (sheetResult) {
      if (sheetResult.success) {
        embed.addFields({
          name: "📊 Arkusz",
          value: `✅ ${sheetResult.message}`,
          inline: false,
        });
      } else {
        embed.addFields({
          name: "📊 Arkusz",
          value: `❌ ${sheetResult.message}`,
          inline: false,
        });
      }
    }

    await thread.send({ embeds: [embed] });

    // Wyślij wiadomość prywatną do ucznia
    try {
      const student = await thread.client.users.fetch(threadData.studentId);
      let dmMessage = `✅ Twoje zgłoszenie nieobecności zostało usprawiedliwione przez prowadzącego w wątku **${thread.name}**.`;
      if (sheetResult && sheetResult.success) {
        dmMessage += `\n📊 Usprawiedliwienie zostało automatycznie zapisane w arkuszu.`;
      }
      await student.send({ content: dmMessage });
    } catch (error) {
      // Nie można wysłać DM
      console.log(
        "Nie można wysłać DM do ucznia o potwierdzeniu usprawiedliwienia"
      );
    }

    // Usuń z aktywnych wątków
    activeAbsenceThreads.delete(thread.id);

    // Archiwizuj wątek po 5 sekundach
    setTimeout(async () => {
      try {
        await thread.setArchived(true);
      } catch (error) {
        console.error("Nie można zarchiwizować wątku:", error);
      }
    }, 5000);
  } catch (error) {
    console.error(
      "Błąd podczas obsługi potwierdzenia usprawiedliwienia:",
      error
    );
  }
}

/**
 * Obsługuje zamknięcie wątku przez kogoś innego lub opuszczenie przez prowadzącego
 */
async function handleThreadClosed(thread, teacherId, studentId) {
  try {
    const embed = new EmbedBuilder()
      .setTitle("⚠️ Prowadzący opuścił wątek")
      .setColor(0xff6600)
      .setDescription(
        "Prowadzący opuścił wątek nieobecności. Sprawa może pozostać nierozstrzygnięta."
      )
      .setTimestamp();

    // Spróbuj wysłać wiadomość w wątku jeśli możliwe
    try {
      if (!thread.archived) {
        await thread.send({ embeds: [embed] });
      }
    } catch (error) {
      console.log("Nie można wysłać wiadomości w zamkniętym wątku");
    }

    // Wyślij wiadomość prywatną do ucznia
    try {
      const student = await thread.client.users.fetch(studentId);
      await student.send({
        content: `⚠️ Prowadzący opuścił wątek zgłoszenia nieobecności **${thread.name}**. Skontaktuj się z nim bezpośrednio w razie potrzeby.`,
      });
    } catch (error) {
      // Nie można wysłać DM
      console.log(
        "Nie można wysłać DM do ucznia o opuszczeniu wątku przez prowadzącego"
      );
    }

    // Usuń z aktywnych wątków
    activeAbsenceThreads.delete(studentId);

    // Archiwizuj wątek po 5 sekundach
    setTimeout(async () => {
      try {
        await thread.setArchived(true);
      } catch (error) {
        console.error("Nie można zarchiwizować wątku:", error);
      }
    }, 5000);
  } catch (error) {
    console.error("Błąd podczas obsługi zamknięcia wątku:", error);
  }
}

/**
 * Próbuje odzyskać dane zgłoszenia nieobecności z embeda w wątku
 */
async function recoverAbsenceDataFromThread(thread) {
  try {
    // Pobierz ostatnie wiadomości z wątku
    const messages = await thread.messages.fetch({ limit: 10 });

    // Znajdź wiadomość z embedem zgłoszenia nieobecności
    for (const message of messages.values()) {
      if (message.embeds.length > 0) {
        const embed = message.embeds[0];

        // Sprawdź czy to embed zgłoszenia nieobecności
        if (embed.title === "📋 Zgłoszenie nieobecności") {
          const fields = embed.fields;
          let studentName = null;
          let grupa = null;
          let data = null;

          // Wyciągnij dane z pól embeda
          for (const field of fields) {
            if (field.name === "👤 Uczeń") {
              // Wyciągnij nazwę studenta z pola (usuń mention i nawiasy)
              const match = field.value.match(/\(([^)]+)\)/);
              if (match) {
                studentName = match[1];
              }
            } else if (field.name === "📚 Grupa") {
              grupa = field.value;
            } else if (field.name === "📅 Data") {
              data = field.value;
            }
          }

          // Znajdź studentId z wzmianki w wiadomości
          let studentId = null;
          const userMentions = message.content.match(/<@(\d+)>/);
          if (userMentions) {
            studentId = userMentions[1];
          }

          if (studentName && grupa && data && studentId) {
            console.log(
              `Odzyskano dane: ${studentName}, grupa ${grupa}, data ${data}`
            );

            return {
              threadId: thread.id,
              teacherId: null, // Nie można odzyskać z embeda
              studentId: studentId,
              startTime: Date.now(),
              group: grupa,
              studentFullName: studentName,
              absenceDate: data,
              reason: "Odzyskano po restarcie bota",
            };
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Błąd podczas odzyskiwania danych z wątku:", error);
    return null;
  }
}

/**
 * Sprawdza czy użytkownik ma aktywny wątek nieobecności
 */
function hasActiveAbsenceThread(userId) {
  return activeAbsenceThreads.has(userId);
}

/**
 * Pobiera informacje o aktywnym wątku użytkownika
 */
function getActiveAbsenceThread(userId) {
  return activeAbsenceThreads.get(userId);
}

module.exports = {
  handleAbsenceReportModal,
  handleAbsenceApproval,
  hasActiveAbsenceThread,
  getActiveAbsenceThread,
};
