const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { checkUserPermissions } = require("../utils/permissions");
const { getAllTeachers } = require("../db/teachers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("lista-prowadzących")
    .setDescription("Wyświetl listę prowadzących przypisanych do grup")
    .setDefaultMemberPermissions(null)
    .setContexts([0]),

  async execute(interaction) {
    try {
      // Sprawdź uprawnienia użytkownika
      const permissions = await checkUserPermissions(interaction, "lista-prowadzących");
      if (!permissions.canUseCommand) {
        await interaction.reply({
          content: `❌ **Brak dostępu:** ${permissions.reason}`,
          flags: 64, // Ephemeral
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      // Pobierz wszystkich prowadzących
      const teachers = await getAllTeachers();

      if (!teachers || teachers.length === 0) {
        await interaction.editReply({
          content: "📋 **Brak przypisanych prowadzących**\n\nNie znaleziono żadnych prowadzących przypisanych do grup. Użyj `/dodaj-prowadzącego` aby przypisać prowadzących do grup.",
        });
        return;
      }

      // Sortuj według numeru grupy
      teachers.sort((a, b) => a.group_id - b.group_id);

      // Twórz embed
      const embed = new EmbedBuilder()
        .setTitle("👨‍🏫 Lista prowadzących grup")
        .setColor(0x3498db)
        .setDescription("Poniżej znajduje się lista prowadzących przypisanych do poszczególnych grup:")
        .setTimestamp()
        .setFooter({
          text: `Zapytanie od ${interaction.user.username}`,
          iconURL: interaction.user.displayAvatarURL(),
        });

      // Przygotuj listę prowadzących
      const teachersList = teachers.map(teacher => {
        const member = interaction.guild.members.cache.get(teacher.discord_id);
        const memberInfo = member ? `<@${teacher.discord_id}>` : `❌ Nie znaleziono (ID: ${teacher.discord_id})`;
        return `**Grupa ${teacher.group_id}:** ${memberInfo}`;
      }).join("\n");

      embed.addFields({
        name: "📚 Przypisania grup",
        value: teachersList,
        inline: false,
      });

      // Dodaj informacje statystyczne
      const totalGroups = teachers.length;
      const missingTeachers = teachers.filter(teacher => 
        !interaction.guild.members.cache.get(teacher.discord_id)
      ).length;

      embed.addFields({
        name: "📊 Statystyki",
        value: [
          `• **Liczba grup:** ${totalGroups}`,
          `• **Prowadzący na serwerze:** ${totalGroups - missingTeachers}`,
          `• **Nieznalezieni prowadzący:** ${missingTeachers}`,
        ].join("\n"),
        inline: false,
      });

      if (missingTeachers > 0) {
        embed.addFields({
          name: "⚠️ Uwaga",
          value: "Niektórzy prowadzący nie zostali znalezieni na serwerze. Mogą być nieaktywni lub opuścili serwer.",
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error("[LISTA-PROWADZĄCYCH] Błąd:", error);

      try {
        if (interaction.deferred) {
          await interaction.editReply({
            content: "❌ Wystąpił błąd podczas pobierania listy prowadzących. Spróbuj ponownie za chwilę.",
          });
        } else if (!interaction.replied) {
          await interaction.reply({
            content: "❌ Wystąpił błąd podczas pobierania listy prowadzących. Spróbuj ponownie za chwilę.",
            flags: 64, // Ephemeral
          });
        }
      } catch (replyError) {
        console.error("[LISTA-PROWADZĄCYCH] Błąd odpowiedzi:", replyError);
      }
    }
  },
};