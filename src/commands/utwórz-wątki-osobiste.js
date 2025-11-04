const {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} = require("discord.js");
const { getAllUsers } = require("../db/users_mysql");
const { getAllTeachers } = require("../db/teachers");
const { getAdminRoleName } = require("../db/config_mysql");
const { checkUserPermissions } = require("../utils/permissions");
const { createPersonalThread, getPersonalThread } = require("../db/threads");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("utwórz-wątki-osobiste")
    .setDescription(
      "Utwórz wątki osobiste dla uczniów w kanale #wątki-osobiste"
    )
    .addStringOption((option) =>
      option
        .setName("grupa")
        .setDescription(
          "Grupa dla której utworzyć wątki (puste = wszystkie grupy)"
        )
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setContexts([0]),

  async execute(interaction) {
    // Sprawdź uprawnienia użytkownika
    const permissions = await checkUserPermissions(
      interaction,
      "utwórz-wątki-osobiste"
    );
    if (!permissions.canUseCommand) {
      await interaction.reply({
        content: `[UPRAWNIENIA] ${permissions.reason}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const targetGroup = interaction.options.getString("grupa");

    await interaction.deferReply({ ephemeral: true });

    try {
      // Znajdź kanał "wątki-osobiste"
      const targetChannel = interaction.guild.channels.cache.find(
        (channel) =>
          channel.name.toLowerCase() === "wątki-osobiste" &&
          channel.type === ChannelType.GuildText
      );

      if (!targetChannel) {
        await interaction.editReply({
          content:
            "❌ Nie znaleziono kanału #wątki-osobiste. Utwórz kanał o tej nazwie lub sprawdź czy bot ma do niego dostęp.",
        });
        return;
      }
      // Sprawdź uprawnienia bota w kanale
      const botPermissions = targetChannel.permissionsFor(
        interaction.client.user
      );
      if (
        !botPermissions.has([
          PermissionFlagsBits.CreatePrivateThreads,
          PermissionFlagsBits.ManageThreads,
          PermissionFlagsBits.SendMessages,
        ])
      ) {
        await interaction.editReply({
          content:
            "❌ Bot nie ma uprawnień do tworzenia wątków w tym kanale. Potrzebne: `Create Private Threads`, `Manage Threads`, `Send Messages`",
        });
        return;
      }

      // Pobierz użytkowników
      const users = await getAllUsers(interaction.guild.id);
      const filteredUsers = targetGroup
        ? users.filter(
            (user) =>
              user.group_number && user.group_number.toString() === targetGroup
          )
        : users.filter((user) => user.group_number); // tylko użytkownicy z grupą

      // Sortowanie: od grupy 12 do 1, w kolejności antyleksykograficznej (Z-A)
      filteredUsers.sort((a, b) => {
        // Pierwszeństwo: grupa (od 12 do 1)
        const groupA = parseInt(a.group_number) || 0;
        const groupB = parseInt(b.group_number) || 0;
        if (groupA !== groupB) {
          return groupB - groupA; // Od większej do mniejszej (12->1)
        }

        // W ramach tej samej grupy: antyleksykograficznie (Z-A)
        const nameA = (a.fullname || "").toLowerCase();
        const nameB = (b.fullname || "").toLowerCase();
        return nameB.localeCompare(nameA); // Od Z do A
      });

      if (filteredUsers.length === 0) {
        await interaction.editReply({
          content: targetGroup
            ? `❌ Nie znaleziono uczniów w grupie ${targetGroup}`
            : "❌ Nie znaleziono uczniów z przypisaną grupą",
        });
        return;
      }

      // Pobierz prowadzących
      const teachers = await getAllTeachers(interaction.guild.id);
      const teacherMap = new Map();
      teachers.forEach((teacher) => {
        if (teacher.group_number) {
          teacherMap.set(teacher.group_number.toString(), teacher.discord_id);
        }
      });

      // Upewnij się że mamy wszystkich członków serwera w cache
      await interaction.guild.members.fetch();

      // Pobierz rolę administratora
      const adminRoleName = await getAdminRoleName(interaction.guild.id);
      const adminRole = interaction.guild.roles.cache.find(
        (role) => role.name === adminRoleName
      );

      let created = 0;
      let errors = 0;
      const errorDetails = [];

      const progressEmbed = new EmbedBuilder()
        .setTitle("🔄 Tworzenie wątków osobistych...")
        .setDescription(`Przetwarzanie ${filteredUsers.length} uczniów...`)
        .setColor(0x3498db);

      await interaction.editReply({ embeds: [progressEmbed] });

      // Przetwarzaj każdego ucznia
      for (const user of filteredUsers) {
        try {
          // Sprawdź czy użytkownik ma discord_id
          if (!user.discord_id) {
            errors++;
            errorDetails.push(
              `${user.fullname || "Nieznany użytkownik"}: Brak Discord ID`
            );
            continue;
          }

          // Sprawdź czy wątek już istnieje w bazie danych
          const existingThread = await getPersonalThread(
            interaction.guild.id,
            user.discord_id
          );
          if (existingThread && existingThread.is_active) {
            continue;
          }

          // Sprawdź czy użytkownik jest na serwerze
          const member = await interaction.guild.members
            .fetch(user.discord_id)
            .catch(() => null);
          if (!member) {
            errors++;
            errorDetails.push(
              `${
                user.fullname || user.discord_id
              }: Użytkownik nie jest na serwerze`
            );
            continue;
          }

          // Utwórz nazwę wątku
          const groupNumber = user.group_number || "?";
          const studentName = user.fullname || `Uczeń ${user.discord_id}`;
          const indexNumber = user.numerIndeksu || "brak";
          const threadName = `[${groupNumber}] ${studentName} (${indexNumber})`;

          // Utwórz wątek
          const thread = await targetChannel.threads.create({
            name: threadName,
            type: ChannelType.PrivateThread,
            autoArchiveDuration: 10080, // 7 dni (w minutach: 7 * 24 * 60 = 10080)
            invitable: false, // Uczniowie nie mogą zapraszać innych
            reason: `Wątek osobisty dla ucznia ${
              user.fullname || user.discord_id
            }`,
          });

          // Zapisz wątek w bazie danych
          try {
            await createPersonalThread(
              interaction.guild.id,
              user.discord_id,
              thread.id,
              targetChannel.id,
              threadName
            );
          } catch (dbError) {
            console.error("Błąd zapisu wątku do bazy danych:", dbError);
          }

          // Lista członków do dodania
          const membersToAdd = [];

          // 1. Dodaj ucznia
          membersToAdd.push(user.discord_id);

          // 2. Dodaj prowadzącego grupy (jeśli istnieje)
          if (
            user.group_number &&
            teacherMap.has(user.group_number.toString())
          ) {
            const teacherId = teacherMap.get(user.group_number.toString());
            if (
              teacherId !== user.discord_id &&
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

          // Dodaj członków do wątku równolegle
          let membersAdded = 0;
          let membersSkipped = 0;

          const memberPromises = membersToAdd.map(async (memberId) => {
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

          // Wyślij wiadomość powitalną
          const teacherInfo =
            user.group_number && teacherMap.has(user.group_number.toString())
              ? `<@${teacherMap.get(user.group_number.toString())}>`
              : "Nie przypisany";

          const welcomeEmbed = new EmbedBuilder()
            .setTitle("🎓 Twój osobisty wątek")
            .setDescription(
              `Witaj w swoim osobistym wątku, <@${user.discord_id}>!`
            )
            .addFields(
              {
                name: "👤 Uczeń",
                value: `<@${user.discord_id}>`,
                inline: true,
              },
              {
                name: "📚 Grupa",
                value: user.group_number
                  ? `**${user.group_number}**`
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

          created++;
        } catch (error) {
          errors++;
          errorDetails.push(
            `${user.fullname || user.discord_id}: ${error.message}`
          );
        }
      }

      // Podsumowanie
      const summaryEmbed = new EmbedBuilder()
        .setTitle("✅ Tworzenie wątków zakończone")
        .addFields(
          {
            name: "📊 Statystyki",
            value: `**Utworzone:** ${created}\n**Błędy:** ${errors}`,
            inline: true,
          },
          {
            name: "👥 Przetworzono",
            value: `${filteredUsers.length} uczniów`,
            inline: true,
          }
        )
        .setColor(errors > 0 ? 0xe67e22 : 0x2ecc71)
        .setTimestamp();

      if (targetGroup) {
        summaryEmbed.addFields({
          name: "🎯 Grupa",
          value: targetGroup,
          inline: true,
        });
      }

      if (errors > 0 && errorDetails.length > 0) {
        const errorText = errorDetails.slice(0, 10).join("\n");
        summaryEmbed.addFields({
          name: "❌ Błędy",
          value:
            errorText +
            (errorDetails.length > 10
              ? `\n... i ${errorDetails.length - 10} więcej`
              : ""),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [summaryEmbed] });
    } catch (error) {
      console.error("[THREADS] Błąd tworzenia wątków:", error);
      await interaction.editReply({
        content: `❌ Wystąpił błąd podczas tworzenia wątków: ${error.message}`,
      });
    }
  },
};
