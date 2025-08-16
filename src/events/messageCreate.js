const { Events, PermissionsBitField } = require("discord.js");
const {
  hasPending,
  takePending,
  getPendingGuildId,
  hasPendingType,
} = require("../state/pending");
const {
  getGroupByEmail,
  getFullnameByEmail,
  importUsersFromText,
  getUserCount,
  updateUserDiscordId,
  getUserByEmail,
  updateUserGroup,
} = require("../db/users_mysql");
const {
  getGroupRoleName,
  getStudentRoleName,
  setServerConfig,
} = require("../db/config_mysql");
const {
  hasConfiguration,
  getConfiguration,
  updateConfiguration,
  finishConfiguration,
} = require("../state/configuration");
const { isChannelBlocked } = require("../state/blockedChannels");

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (message.author.bot) return;

    // Sprawdź czy kanał ma włączone blokowanie wiadomości
    if (
      message.guild &&
      isChannelBlocked(message.guild.id, message.channel.id)
    ) {
      // Sprawdź czy wiadomość to komenda (zaczyna się od /)
      if (!message.content.startsWith("/")) {
        try {
          await message.delete();
          console.log(
            `[BLOCK] Usunięto wiadomość od ${message.author.tag} w kanale ${message.channel.name}: "${message.content}"`
          );
        } catch (error) {
          console.error("[BLOCK] Nie udało się usunąć wiadomości:", error);
        }

        return; // Zatrzymaj dalsze przetwarzanie
      }
    }

    const userId = message.author.id;

    // Obsługa konfiguracji ról w prywatnych wątkach
    if (
      hasConfiguration(userId) &&
      message.channel.isThread() &&
      message.channel.name.startsWith("Konfiguracja -")
    ) {
      await handleConfigurationMessage(message, client);
      return;
    }

    // Obsługa importu użytkowników w prywatnych wątkach
    if (
      message.channel.isThread() &&
      message.channel.name.startsWith("📚 Import uczniów -")
    ) {
      await handleUserImportMessage(message, client);
      return;
    }

    // Obsługa zmiany grupy w prywatnych wątkach
    if (
      message.channel.isThread() &&
      message.channel.name.startsWith("Zmiana grupy -") &&
      hasPendingType(userId, "group_change")
    ) {
      await handleGroupChangeMessage(message, client);
      return;
    }

    // Obsługuj tylko wątki prywatne utworzone przez bota dla rejestracji
    if (!message.channel.isThread() || !message.channel.type === 12) return; // 12 = PrivateThread
    if (!message.channel.name.startsWith("Rejestracja -")) return;

    await handleRegistrationMessage(message, client);
  },
};

async function handleConfigurationMessage(message, client) {
  const userId = message.author.id;
  const config = getConfiguration(userId);
  if (!config) return;

  try {
    if (config.step === "group_count") {
      const count = parseInt(message.content.trim());
      if (isNaN(count) || count < 1 || count > 50) {
        await message.reply("Podaj poprawną liczbę grup (1-50).");
        return;
      }

      updateConfiguration(userId, { groupCount: count, step: "group_roles" });
      await message.reply(
        `Dobrze! Teraz podaj rolę dla grupy 1. Napisz wiadomość z pingiem roli (np. @Grupa1)`
      );
    } else if (config.step === "group_roles") {
      const roleMention = message.mentions.roles.first();
      if (!roleMention) {
        await message.reply(
          `Nie znaleziono roli. Upewnij się, że pingujesz rolę (np. @NazwaRoli) dla grupy ${config.currentGroup}.`
        );
        return;
      }

      config.groupRoles[config.currentGroup] = roleMention.name;

      if (config.currentGroup < config.groupCount) {
        updateConfiguration(userId, { currentGroup: config.currentGroup + 1 });
        await message.reply(
          `Zapisano rolę "${roleMention.name}" dla grupy ${
            config.currentGroup - 1
          }. Teraz podaj rolę dla grupy ${config.currentGroup}.`
        );
      } else {
        updateConfiguration(userId, { step: "student_role" });
        await message.reply(
          "Świetnie! Teraz podaj rolę dla uczniów. Napisz wiadomość z pingiem roli."
        );
      }
    } else if (config.step === "student_role") {
      const roleMention = message.mentions.roles.first();
      if (!roleMention) {
        await message.reply(
          "Nie znaleziono roli. Upewnij się, że pingujesz rolę dla uczniów."
        );
        return;
      }

      config.studentRole = roleMention.name;

      // Przejdź do kroku importu użytkowników
      updateConfiguration(userId, { step: "import_users" });

      await message.reply(
        `✅ **Konfiguracja ról zakończona!**\n\n` +
          `**Rola ucznia:** ${roleMention.name}\n` +
          `**Role grup:**\n` +
          (() => {
            let roles = "";
            for (let i = 1; i <= config.groupCount; i++) {
              roles += `• Grupa ${i}: ${config.groupRoles[i]}\n`;
            }
            return roles;
          })() +
          `\n📁 **Krok opcjonalny - Import użytkowników:**\n` +
          `Możesz teraz wrzucić plik .txt z użytkownikami do zaimportowania do bazy.\n` +
          `Format pliku: \`<imię i nazwisko>;<email>;<numer grupy>\` (każda osoba w osobnej linii)\n\n` +
          `**Przykład:**\n` +
          `\`Jan Kowalski;jan.kowalski@example.com;1\`\n` +
          `\`Anna Nowak;anna.nowak@example.com;2\`\n\n` +
          `Wrzuć plik lub napisz **"pomiń"** aby zakończyć konfigurację.`
      );
    } else if (config.step === "import_users") {
      const content = message.content.toLowerCase().trim();

      if (content === "pomiń" || content === "pomij") {
        // Zakończ bez importu
        const finalConfig = finishConfiguration(userId);
        setServerConfig(config.guildId, {
          groupRoles: finalConfig.groupRoles,
          studentRole: finalConfig.studentRole,
          configuredBy: userId,
          configuredAt: new Date().toISOString(),
        });

        const totalUsers = await getUserCount();
        await message.reply(
          `✅ **Konfiguracja zakończona bez importu użytkowników!**\n\n` +
            `Aktualna liczba użytkowników w bazie: **${totalUsers}**\n\n` +
            `Wątek zostanie automatycznie zamknięty.`
        );

        // Zamknij wątek
        setTimeout(async () => {
          try {
            await message.channel.setArchived(true);
          } catch (err) {
            console.warn("[THREAD] Nie udało się zamknąć wątku:", err.message);
          }
        }, 5000);
      } else if (message.attachments.size > 0) {
        // Obsługa pliku załącznika
        const attachment = message.attachments.first();

        if (!attachment.name.endsWith(".txt")) {
          await message.reply("❌ Plik musi mieć rozszerzenie .txt");
          return;
        }

        try {
          // Pobierz zawartość pliku
          const response = await fetch(attachment.url);
          const textContent = await response.text();

          if (!textContent || textContent.trim().length === 0) {
            await message.reply(
              "❌ Plik jest pusty lub nie można go odczytać."
            );
            return;
          }

          await message.reply(
            "⏳ Importuję użytkowników... To może chwilę potrwać."
          );

          // Importuj użytkowników
          const results = await importUsersFromText(textContent);
          const totalUsers = await getUserCount();

          // Zakończ konfigurację
          const finalConfig = finishConfiguration(userId);
          setServerConfig(config.guildId, {
            groupRoles: finalConfig.groupRoles,
            studentRole: finalConfig.studentRole,
            configuredBy: userId,
            configuredAt: new Date().toISOString(),
          });

          // Podsumowanie importu
          let importSummary = `✅ **Import użytkowników zakończony!**\n\n`;
          importSummary += `📊 **Statystyki:**\n`;
          importSummary += `• Przetworzono linii: **${results.total}**\n`;
          importSummary += `• Dodano nowych użytkowników: **${results.added}**\n`;
          importSummary += `• Zaktualizowano istniejących: **${results.updated}**\n`;
          importSummary += `• Błędy: **${results.errors.length}**\n\n`;
          importSummary += `📈 **Aktualna liczba użytkowników w bazie: ${totalUsers}**\n\n`;

          if (results.errors.length > 0 && results.errors.length <= 10) {
            importSummary += `⚠️ **Błędy:**\n`;
            results.errors.forEach((error) => {
              importSummary += `• ${error}\n`;
            });
          } else if (results.errors.length > 10) {
            importSummary += `⚠️ **Błędy:** ${results.errors.length} błędów (zbyt dużo aby wyświetlić)\n`;
          }

          importSummary += `\nWątek zostanie automatycznie zamknięty.`;

          await message.reply(importSummary);

          // Zamknij wątek
          setTimeout(async () => {
            try {
              await message.channel.setArchived(true);
            } catch (err) {
              console.warn(
                "[THREAD] Nie udało się zamknąć wątku:",
                err.message
              );
            }
          }, 10000);
        } catch (error) {
          console.error("[IMPORT] Błąd importu użytkowników:", error);
          await message.reply(
            "❌ Wystąpił błąd podczas importu użytkowników. Sprawdź format pliku i spróbuj ponownie."
          );
        }
      } else {
        await message.reply(
          '❌ Wrzuć plik .txt z użytkownikami lub napisz **"pomiń"** aby zakończyć konfigurację.'
        );
      }
    }
  } catch (error) {
    console.error("[CONFIG] Błąd podczas konfiguracji:", error);
    await message.reply(
      "Wystąpił błąd podczas konfiguracji. Spróbuj ponownie."
    );
  }
}

async function handleRegistrationMessage(message, client) {
  const userId = message.author.id;
  if (!hasPending(userId)) return;

  const email = (message.content || "").trim();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!isEmail) {
    await message.reply(
      "To nie wygląda na poprawny adres e‑mail. Spróbuj ponownie."
    );
    return;
  }

  try {
    const group = await getGroupByEmail(email);
    const fullname = await getFullnameByEmail(email);

    if (!group) {
      await message.reply(
        "Nie znaleziono takiego e‑maila w bazie. Skontaktuj się z administracją."
      );
      return;
    }

    // Usuń oczekiwanie dopiero po potwierdzeniu, że email istnieje
    const pendingData = takePending(userId);
    if (!pendingData) return;

    // Wyciągnij guildId z danych pending
    const guildId =
      typeof pendingData === "string" ? pendingData : pendingData.guildId;
    if (!guildId) return;

    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);

    const roleStudentName = await getStudentRoleName(guildId);
    const roleGroupName = await getGroupRoleName(guildId, group);

    let roleStudent = guild.roles.cache.find((r) => r.name === roleStudentName);
    if (!roleStudent) {
      roleStudent = await guild.roles.create({
        name: roleStudentName,
        reason: "Auto-create role",
      });
    }

    let roleGroup = guild.roles.cache.find((r) => r.name === roleGroupName);
    if (!roleGroup) {
      roleGroup = await guild.roles.create({
        name: roleGroupName,
        reason: "Auto-create role",
      });
    }

    await member.roles.add([roleStudent, roleGroup]);

    // Zapisz Discord ID użytkownika w bazie danych
    await updateUserDiscordId(email, userId);

    // Zmień pseudonim na imię i nazwisko, jeśli dostępne
    if (fullname) {
      try {
        await member.setNickname(fullname);
        console.log(
          `[NICK] Zmieniono pseudonim ${member.user.tag} na "${fullname}"`
        );
      } catch (nickErr) {
        console.warn(
          `[NICK] Nie udało się zmienić pseudonimu dla ${member.user.tag}:`,
          nickErr.message
        );
      }
    }

    const successMessage = fullname
      ? `Dziękuję! Nadano role: "${roleStudentName}" oraz "${roleGroupName}". Zmieniono pseudonim na "${fullname}". Wątek zostanie automatycznie zamknięty.`
      : `Dziękuję! Nadano role: "${roleStudentName}" oraz "${roleGroupName}". Wątek zostanie automatycznie zamknięty.`;

    await message.reply(successMessage);

    // Automatycznie zamknij wątek po 3 sekundach
    setTimeout(async () => {
      try {
        await message.channel.setArchived(true);
        console.log(
          `[THREAD] Zamknięto wątek rejestracyjny dla ${message.author.tag}`
        );
      } catch (err) {
        console.warn("[THREAD] Nie udało się zamknąć wątków:", err.message);
      }
    }, 3000); // 3 sekundy
  } catch (err) {
    console.error("[Roles] Błąd przy nadawaniu ról:", err);
    try {
      await message.reply(
        "Wystąpił błąd podczas nadawania ról. Skontaktuj się z administracją."
      );
    } catch {}
  }
}

// Obsługa importu użytkowników
async function handleUserImportMessage(message, client) {
  try {
    if (message.attachments.size === 0) {
      await message.channel.send(
        "❌ Nie znaleziono załącznika. Proszę załączyć plik .txt z danymi uczniów.\n\n" +
          "**Format pliku:**\n" +
          "```\n" +
          "Jan Kowalski;jan.kowalski@email.com;1\n" +
          "Anna Nowak;anna.nowak@email.com;2\n" +
          "```\n" +
          "Każda linia: `Imię Nazwisko;email@domena.com;numer_grupy`\n\n" +
          "💡 **Wskazówka**: Jeśli używasz polskich znaków, zapisz plik w kodowaniu UTF-8."
      );
      return;
    }

    const attachment = message.attachments.first();
    if (!attachment.name.endsWith(".txt")) {
      await message.channel.send(
        "❌ Nieprawidłowy format pliku. Proszę załączyć plik .txt."
      );
      return;
    }

    // Pobierz zawartość pliku
    const response = await fetch(attachment.url);

    // Pobierz dane jako buffer, żeby móc sprawdzić kodowanie
    const buffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);

    // Spróbuj różnych kodowań
    let fileContent;
    let detectedEncoding = "utf-8";

    try {
      // Najpierw spróbuj UTF-8
      fileContent = new TextDecoder("utf-8", { fatal: true }).decode(
        uint8Array
      );
    } catch (error) {
      try {
        // Jeśli UTF-8 nie działa, spróbuj Windows-1250 (polskie znaki)
        fileContent = new TextDecoder("windows-1250").decode(uint8Array);
        detectedEncoding = "windows-1250";
        await message.channel.send(
          "📝 Wykryto kodowanie Windows-1250, konwertuję..."
        );
      } catch (error2) {
        try {
          // Ostatnia próba - ISO-8859-2 (Latin-2)
          fileContent = new TextDecoder("iso-8859-2").decode(uint8Array);
          detectedEncoding = "iso-8859-2";
          await message.channel.send(
            "📝 Wykryto kodowanie ISO-8859-2, konwertuję..."
          );
        } catch (error3) {
          // Fallback - użyj UTF-8 z ignorowaniem błędów
          fileContent = new TextDecoder("utf-8", { fatal: false }).decode(
            uint8Array
          );
          detectedEncoding = "utf-8 (z błędami)";
          await message.channel.send(
            "⚠️ Problemy z kodowaniem znaków - mogą wystąpić zniekształcenia."
          );
        }
      }
    }

    if (!fileContent.trim()) {
      await message.channel.send("❌ Plik jest pusty.");
      return;
    }

    await message.channel.send(
      `📊 Przetwarzam plik... To może chwilę potrwać.`
    );

    // Użyj istniejącej funkcji do importu
    const results = await importUsersFromText(fileContent);

    // Wyślij podsumowanie
    let summary = `✅ Import zakończony!\n\n`;
    summary += `📈 **Podsumowanie:**\n`;
    summary += `• Przetworzono: ${results.total} linii\n`;
    summary += `• Dodano nowych: ${results.added} użytkowników\n`;
    summary += `• Zaktualizowano: ${results.updated} użytkowników\n`;
    summary += `• Kodowanie pliku: ${detectedEncoding}\n`;

    if (results.errors.length > 0) {
      summary += `• Błędy: ${results.errors.length}\n\n`;
      summary += `**Szczegóły błędów:**\n`;
      results.errors.slice(0, 10).forEach((error, index) => {
        summary += `${index + 1}. ${error}\n`;
      });

      if (results.errors.length > 10) {
        summary += `... i ${results.errors.length - 10} więcej błędów\n`;
      }
    }

    // Dodaj informacje o formacie, jeśli były błędy
    if (results.errors.length > 0) {
      summary += `\n**Przypomnienie o formacie:**\n`;
      summary += `Każda linia powinna zawierać: \`Imię Nazwisko;email@domena.com;numer_grupy\``;
    }

    await message.channel.send(summary);

    // Zamknij wątek po 60 sekundach
    setTimeout(async () => {
      try {
        await message.channel.send("🔒 Zamykam wątek importu...");
        await message.channel.setLocked(true);
        await message.channel.setArchived(true);
      } catch (error) {
        console.error("Błąd podczas zamykania wątku importu:", error);
      }
    }, 60000);
  } catch (error) {
    console.error("Błąd podczas importu użytkowników:", error);
    await message.channel.send(
      "❌ Wystąpił błąd podczas importu użytkowników. Sprawdź format pliku i spróbuj ponownie."
    );
  }
}

async function handleGroupChangeMessage(message, client) {
  const userId = message.author.id;
  const { hasPendingType, takePending } = require("../state/pending");
  
  if (!hasPendingType(userId, "group_change")) {
    return;
  }

  const pendingData = message.client.groupChangeStates?.get(userId) || {
    step: "email",
    email: null,
    userData: null,
    newGroup: null
  };

  // Inicjalizuj mapę stanów jeśli nie istnieje
  if (!message.client.groupChangeStates) {
    message.client.groupChangeStates = new Map();
  }

  try {
    if (pendingData.step === "email") {
      const email = message.content.trim().toLowerCase();
      
      // Walidacja formatu email
      if (!email.includes("@") || !email.includes(".")) {
        await message.reply("❌ Podaj prawidłowy adres e-mail (przykład: jan.kowalski@example.com)");
        return;
      }

      // Znajdź użytkownika w bazie
      const userData = await getUserByEmail(email);
      
      if (!userData) {
        await message.reply(`❌ Nie znaleziono użytkownika z adresem e-mail: **${email}**\n\nSprawdź czy adres jest poprawny i czy użytkownik znajduje się w bazie danych.`);
        return;
      }

      // Pobierz informacje o roli Discord (jeśli user ma Discord ID)
      let discordInfo = "";
      if (userData.discordId) {
        try {
          const discordUser = await client.users.fetch(userData.discordId);
          const guildMember = await message.guild.members.fetch(userData.discordId);
          discordInfo = `\n**Discord:** ${discordUser.tag} (${guildMember.displayName})`;
        } catch (error) {
          discordInfo = `\n**Discord ID:** ${userData.discordId} (użytkownik niedostępny)`;
        }
      } else {
        discordInfo = `\n**Discord:** Nie połączony`;
      }

      // Wyświetl informacje o użytkowniku
      await message.reply(
        `✅ **Znaleziono użytkownika:**\n\n` +
        `**Imię i nazwisko:** ${userData.fullname || "Brak danych"}\n` +
        `**E-mail:** ${userData.email || email}\n` +
        `**Aktualna grupa:** ${userData.group}${discordInfo}\n\n` +
        `🔄 **Do której grupy chcesz przenieść tego użytkownika?**\n` +
        `Wpisz numer grupy (np. 1, 2, 3...):`
      );

      // Zapisz dane użytkownika i przejdź do następnego kroku
      pendingData.step = "new_group";
      pendingData.email = email;
      pendingData.userData = userData;
      message.client.groupChangeStates.set(userId, pendingData);

    } else if (pendingData.step === "new_group") {
      const groupInput = message.content.trim();
      const newGroup = parseInt(groupInput);

      // Walidacja numeru grupy
      if (isNaN(newGroup) || newGroup < 1 || newGroup > 99) {
        await message.reply("❌ Podaj prawidłowy numer grupy (liczba od 1 do 99)");
        return;
      }

      // Sprawdź czy to nie ta sama grupa
      if (String(newGroup) === String(pendingData.userData.group)) {
        await message.reply(`❌ Użytkownik już znajduje się w grupie **${newGroup}**. Podaj inny numer grupy.`);
        return;
      }

      // Pobierz nazwy ról
      const { getGroupRoleName } = require("../db/config_mysql");
      const oldGroupRole = await getGroupRoleName(message.guild.id, pendingData.userData.group);
      const newGroupRole = await getGroupRoleName(message.guild.id, newGroup);

      // Wyświetl podsumowanie i zapytaj o potwierdzenie
      await message.reply(
        `📋 **Podsumowanie zmiany grupy:**\n\n` +
        `**Użytkownik:** ${pendingData.userData.fullname || "Brak danych"}\n` +
        `**E-mail:** ${pendingData.email}\n` +
        `**Zmiana:** Grupa ${pendingData.userData.group} (${oldGroupRole}) → Grupa ${newGroup} (${newGroupRole})\n\n` +
        `⚠️ **Czy na pewno chcesz wykonać tę zmianę?**\n` +
        `Wpisz **"tak"** aby potwierdzić lub **"nie"** aby anulować.`
      );

      // Zapisz nowy numer grupy i przejdź do kroku potwierdzenia
      pendingData.step = "confirmation";
      pendingData.newGroup = newGroup;
      message.client.groupChangeStates.set(userId, pendingData);

    } else if (pendingData.step === "confirmation") {
      const confirmation = message.content.trim().toLowerCase();

      if (confirmation === "nie" || confirmation === "anuluj") {
        // Anuluj proces
        message.client.groupChangeStates.delete(userId);
        takePending(userId);
        
        await message.reply("❌ **Proces zmiany grupy został anulowany.**\n\nWątek zostanie zamknięty za 10 sekund.");
        
        setTimeout(async () => {
          try {
            await message.channel.setArchived(true);
          } catch (error) {
            console.warn("[THREAD] Nie udało się zamknąć wątku:", error.message);
          }
        }, 10000);
        return;
      }

      if (confirmation !== "tak") {
        await message.reply(`⚠️ Wpisz **"tak"** aby potwierdzić zmianę lub **"nie"** aby anulować.`);
        return;
      }

      // Wykonaj zmianę grupy
      await message.reply("⏳ **Przetwarzam zmianę grupy...**");

      // 1. Zaktualizuj bazę danych
      const dbUpdateSuccess = await updateUserGroup(pendingData.email, pendingData.newGroup);
      
      if (!dbUpdateSuccess) {
        await message.reply("❌ **Błąd podczas aktualizacji bazy danych.** Spróbuj ponownie lub skontaktuj się z administratorem.");
        return;
      }

      // 2. Zaktualizuj role Discord (jeśli użytkownik ma Discord ID)
      let roleUpdateInfo = "";
      if (pendingData.userData.discordId) {
        try {
          const guildMember = await message.guild.members.fetch(pendingData.userData.discordId);
          const { getGroupRoleName } = require("../db/config_mysql");
          
          // Znajdź i usuń starą rolę grupy
          const oldGroupRole = await getGroupRoleName(message.guild.id, pendingData.userData.group);
          const oldRole = message.guild.roles.cache.find(role => role.name === oldGroupRole);
          
          // Znajdź i dodaj nową rolę grupy
          const newGroupRole = await getGroupRoleName(message.guild.id, pendingData.newGroup);
          const newRole = message.guild.roles.cache.find(role => role.name === newGroupRole);

          if (oldRole && guildMember.roles.cache.has(oldRole.id)) {
            await guildMember.roles.remove(oldRole);
            roleUpdateInfo += `\n✅ Usunięto rolę: **${oldRole.name}**`;
          }

          if (newRole) {
            await guildMember.roles.add(newRole);
            roleUpdateInfo += `\n✅ Dodano rolę: **${newRole.name}**`;
          } else {
            roleUpdateInfo += `\n⚠️ Nie znaleziono roli dla grupy ${pendingData.newGroup}`;
          }

          // Wyślij prywatną wiadomość do użytkownika
          try {
            const discordUser = await client.users.fetch(pendingData.userData.discordId);
            await discordUser.send(
              `🔄 **Zmiana grupy**\n\n` +
              `Cześć! Informujemy, że Twoja grupa została zmieniona.\n\n` +
              `**Nowa grupa:** ${pendingData.newGroup}\n` +
              `**Serwer:** ${message.guild.name}\n\n` +
              `Jeśli masz pytania, skontaktuj się z administracją serwera.`
            );
            roleUpdateInfo += `\n✅ Wysłano powiadomienie do użytkownika`;
          } catch (dmError) {
            roleUpdateInfo += `\n⚠️ Nie udało się wysłać powiadomienia do użytkownika (DM zablokowane)`;
          }

        } catch (memberError) {
          roleUpdateInfo += `\n❌ Nie udało się zaktualizować ról Discord: ${memberError.message}`;
        }
      } else {
        roleUpdateInfo = `\n📝 Użytkownik nie ma połączonego konta Discord - role nie zostały zaktualizowane`;
      }

      // Wyświetl podsumowanie
      await message.reply(
        `✅ **Zmiana grupy zakończona pomyślnie!**\n\n` +
        `**Użytkownik:** ${pendingData.userData.fullname || "Brak danych"}\n` +
        `**E-mail:** ${pendingData.email}\n` +
        `**Stara grupa:** ${pendingData.userData.group}\n` +
        `**Nowa grupa:** ${pendingData.newGroup}\n\n` +
        `📊 **Status aktualizacji:**\n` +
        `✅ Baza danych zaktualizowana${roleUpdateInfo}\n\n` +
        `Wątek zostanie zamknięty za 30 sekund.`
      );

      // Wyczyść stan i zamknij wątek
      message.client.groupChangeStates.delete(userId);
      takePending(userId);

      setTimeout(async () => {
        try {
          await message.channel.setArchived(true);
        } catch (error) {
          console.warn("[THREAD] Nie udało się zamknąć wątku:", error.message);
        }
      }, 30000);
    }

  } catch (error) {
    console.error("[ZMIANA GRUPY] Błąd podczas przetwarzania:", error);
    await message.reply("❌ Wystąpił błąd podczas zmiany grupy. Spróbuj ponownie lub skontaktuj się z administracją.");
    
    // Wyczyść stan w przypadku błędu
    message.client.groupChangeStates?.delete(userId);
    takePending(userId);
  }
}
