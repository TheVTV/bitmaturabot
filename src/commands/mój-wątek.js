const {
  SlashCommandBuilder,
  MessageFlags,
  ChannelType,
  EmbedBuilder,
} = require("discord.js");
const { getUserByDiscordId } = require("../db/users_mysql");
const { getAllTeachers } = require("../db/teachers");
const { getAdminRoleName } = require("../db/config_mysql");
const { checkUserPermissions } = require("../utils/permissions");
const { createPersonalThread, getPersonalThread } = require("../db/threads");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mój-wątek")
    .setDescription("Uzyskaj dostęp do swojego osobistego wątku z nauczycielem")
    .setContexts([0]),

  async execute(interaction) {
    try {
      // Sprawdź uprawnienia użytkownika (tylko uczniowie)
      const permissions = await checkUserPermissions(interaction, "mój-wątek");
      if (!permissions.canUseCommand || permissions.userType !== "student") {
        await interaction.reply({
          content: "❌ Ta komenda jest dostępna tylko dla uczniów.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      // Pobierz dane ucznia z bazy
      const studentData = await getUserByDiscordId(interaction.user.id);
      if (!studentData) {
        await interaction.editReply({
          content:
            "❌ Nie znaleziono Twoich danych w systemie. Skontaktuj się z administratorem.",
        });
        return;
      }

      // Znajdź kanał "wątki-osobiste"
      const targetChannel = interaction.guild.channels.cache.find(
        (channel) => channel.name === "wątki-osobiste"
      );

      if (!targetChannel) {
        await interaction.editReply({
          content:
            "❌ Nie znaleziono kanału #wątki-osobiste. Skontaktuj się z administratorem.",
        });
        return;
      }

      // Sprawdź czy uczeń ma już wątek w bazie danych
      let existingThread = await getPersonalThread(
        interaction.guild.id,
        interaction.user.id
      );

      let thread = null;
      let threadStatus = "unknown";

      if (existingThread) {
        // Sprawdź czy wątek nadal istnieje na Discordzie
        try {
          thread = await interaction.guild.channels.fetch(
            existingThread.thread_id
          );
          if (thread) {
            // Wątek istnieje - sprawdź czy uczeń jest członkiem
            const member = thread.members.cache.get(interaction.user.id);
            if (member) {
              threadStatus = "exists_and_member";
            } else {
              threadStatus = "exists_not_member";
            }
          }
        } catch (error) {
          // Wątek nie istnieje na Discordzie
          threadStatus = "deleted";
        }
      } else {
        threadStatus = "no_thread";
      }

      // Wykonaj odpowiednią akcję na podstawie statusu
      switch (threadStatus) {
        case "no_thread":
        case "deleted":
          // Utwórz nowy wątek
          thread = await createNewPersonalThread(
            interaction,
            targetChannel,
            studentData
          );
          break;

        case "exists_not_member":
          // Dodaj ucznia z powrotem do wątku
          try {
            await thread.members.add(interaction.user.id);
            await interaction.editReply({
              content: `✅ Dodano Cię z powrotem do wątku! Przejdź do: ${thread}`,
            });
            return;
          } catch (error) {
            console.error("Błąd podczas dodawania do wątku:", error);
            await interaction.editReply({
              content: `❌ Nie udało się dodać Cię do wątku. Spróbuj ponownie lub skontaktuj się z administratorem.`,
            });
            return;
          }

        case "exists_and_member":
          // Po prostu przekieruj do istniejącego wątku
          await interaction.editReply({
            content: `✅ Twój wątek osobisty: ${thread}`,
          });
          return;
      }

      if (thread) {
        await interaction.editReply({
          content: `✅ Twój wątek osobisty został utworzony! Przejdź do: ${thread}`,
        });
      } else {
        await interaction.editReply({
          content:
            "❌ Wystąpił błąd podczas tworzenia wątku. Spróbuj ponownie.",
        });
      }
    } catch (error) {
      console.error("Błąd w komendzie mój-wątek:", error);
      await interaction.editReply({
        content:
          "❌ Wystąpił błąd. Spróbuj ponownie lub skontaktuj się z administratorem.",
      });
    }
  },
};

/**
 * Tworzy nowy wątek osobisty dla ucznia
 */
async function createNewPersonalThread(
  interaction,
  targetChannel,
  studentData
) {
  try {
    // Upewnij się że mamy wszystkich członków serwera w cache (jak w utwórz-wątki-osobiste)
    await interaction.guild.members.fetch();

    // Pobierz listę prowadzących
    const teachers = await getAllTeachers(interaction.guild.id);
    const teacherMap = new Map();
    teachers.forEach((teacher) => {
      if (teacher.group_number) {
        teacherMap.set(teacher.group_number.toString(), teacher.discord_id);
      }
    });

    // Pobierz rolę administratorów
    const adminRoleName = await getAdminRoleName(interaction.guild.id);
    let adminRole = null;

    if (adminRoleName) {
      adminRole = interaction.guild.roles.cache.find(
        (role) => role.name === adminRoleName
      );
    }

    // Utwórz nazwę wątku
    const groupNumber = studentData.group || "?";
    const studentName =
      studentData.fullname || `Uczeń ${studentData.discordId}`;
    const indexNumber = studentData.numerIndeksu || "brak";
    const threadName = `[${groupNumber}] ${studentName} (${indexNumber})`;

    // Utwórz wątek
    const thread = await targetChannel.threads.create({
      name: threadName,
      type: ChannelType.PrivateThread,
      autoArchiveDuration: 10080, // 7 dni (w minutach: 7 * 24 * 60 = 10080)
      invitable: false, // Uczniowie nie mogą zapraszać innych
      reason: `Wątek osobisty dla ucznia ${
        studentData.fullname || studentData.discordId
      }`,
    });

    // Zapisz wątek w bazie danych
    try {
      await createPersonalThread(
        interaction.guild.id,
        studentData.discordId,
        thread.id,
        targetChannel.id,
        threadName
      );
    } catch (dbError) {
      console.error("Błąd zapisu wątku do bazy danych:", dbError);
    }

    // Lista członków do dodania
    const membersToAdd = [];

    // 1. Dodaj ucznia (sprawdź czy ID jest poprawne)
    if (studentData.discordId && typeof studentData.discordId === "string") {
      membersToAdd.push(studentData.discordId);
    } else {
      console.error(
        "Błąd: Brak poprawnego discordId dla studenta:",
        studentData
      );
    }

    // 2. Dodaj prowadzącego grupy (jeśli istnieje)
    if (studentData.group && teacherMap.has(studentData.group.toString())) {
      const teacherId = teacherMap.get(studentData.group.toString());
      if (
        teacherId &&
        teacherId !== studentData.discordId &&
        !membersToAdd.includes(teacherId)
      ) {
        membersToAdd.push(teacherId);
      }
    }

    // 3. Dodaj wszystkich administratorów z rolą
    if (adminRole) {
      adminRole.members.forEach((adminMember) => {
        if (adminMember.id && !membersToAdd.includes(adminMember.id)) {
          membersToAdd.push(adminMember.id);
        }
      });
    }

    // Filtruj undefined/null wartości przed dodawaniem do wątku
    const validMembers = membersToAdd.filter(
      (userId) => userId && typeof userId === "string"
    );

    // Dodaj członków do wątku równolegle (jak w utwórz-wątki-osobiste)
    let membersAdded = 0;
    let membersSkipped = 0;

    const memberPromises = validMembers.map(async (memberId) => {
      try {
        // Sprawdź czy użytkownik jest na serwerze
        const memberToAdd = await interaction.guild.members
          .fetch(memberId)
          .catch(() => null);
        if (!memberToAdd) {
          return { success: false, reason: "not_found" };
        }

        await thread.members.add(memberId);
        return { success: true };
      } catch (error) {
        return { success: false, reason: "add_failed" };
      }
    });

    // Poczekaj na wszystkie operacje dodawania
    const results = await Promise.allSettled(memberPromises);
    results.forEach((result) => {
      if (result.status === "fulfilled" && result.value.success) {
        membersAdded++;
      } else {
        membersSkipped++;
      }
    });

    // Wyślij wiadomość powitalną (jak w utwórz-wątki-osobiste)
    const teacherInfo =
      studentData.group && teacherMap.has(studentData.group.toString())
        ? `<@${teacherMap.get(studentData.group.toString())}>`
        : "Nie przypisany";

    const welcomeEmbed = new EmbedBuilder()
      .setTitle("🎓 Twój osobisty wątek")
      .setDescription(
        `Witaj w swoim osobistym wątku, <@${studentData.discordId}>!`
      )
      .addFields(
        {
          name: "👤 Uczeń",
          value: `<@${studentData.discordId}>`,
          inline: true,
        },
        {
          name: "📚 Grupa",
          value: studentData.group
            ? `**${studentData.group}**`
            : "Nie przypisana",
          inline: true,
        },
        { name: "👨‍🏫 Prowadzący", value: teacherInfo, inline: true },
        {
          name: "ℹ️ Informacje",
          value:
            "• Wątek archiwizuje się po **7 dniach** nieaktywności\n• Tylko prowadzący i administratorzy mogą zapraszać inne osoby",
          inline: false,
        }
      )
      .setColor(0x2ecc71)
      .setFooter({
        text: "Ten wątek służy do komunikacji z prowadzącym i administratorami.",
      })
      .setTimestamp();

    await thread.send({ embeds: [welcomeEmbed] });

    return thread;
  } catch (error) {
    console.error("Błąd podczas tworzenia wątku:", error);
    return null;
  }
}
