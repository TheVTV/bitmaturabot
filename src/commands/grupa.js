const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getUsersByGroup } = require("../db/users_mysql");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("grupa")
    .setDescription("Wyświetl listę uczniów z wybranej grupy")
    .addIntegerOption((option) =>
      option
        .setName("numer")
        .setDescription("Numer grupy (np. 1, 2, 3...)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(999)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setContexts([0]),

  async execute(interaction) {
    try {
      const groupNumber = interaction.options.getInteger("numer");

      // Defer reply, bo może to potrwać chwilę
      await interaction.deferReply({ flags: 64 }); // 64 = ephemeral flag

      // Pobierz listę użytkowników z grupy
      const users = await getUsersByGroup(groupNumber);

      if (!users || users.length === 0) {
        await interaction.editReply({
          content: `❌ Nie znaleziono użytkowników w grupie ${groupNumber}.`,
        });
        return;
      }

      // Przygotuj listę użytkowników
      let userList = `👥 **Grupa ${groupNumber}** (${users.length} uczniów)\n\n`;

      users.forEach((user, index) => {
        userList += `${index + 1}. **${user.fullname}**\n`;
        userList += `   📧 ${user.email}\n`;
        if (user.discordId) {
          userList += `   🎮 <@${user.discordId}>\n`;
        }
        userList += "\n";
      });

      // Sprawdź czy wiadomość nie jest za długa (limit 2000 znaków)
      if (userList.length > 2000) {
        // Podziel na części
        const chunks = [];
        const lines = userList.split("\n");
        let currentChunk = `👥 **Grupa ${groupNumber}** (${users.length} uczniów)\n\n`;

        for (let i = 2; i < lines.length; i++) {
          // Pomijamy header
          const line = lines[i] + "\n";
          if (currentChunk.length + line.length > 1900) {
            chunks.push(currentChunk);
            currentChunk = line;
          } else {
            currentChunk += line;
          }
        }

        if (currentChunk.trim()) {
          chunks.push(currentChunk);
        }

        // Wyślij pierwszą część
        await interaction.editReply({
          content: chunks[0],
        });

        // Wyślij kolejne części jako follow-up
        for (let i = 1; i < chunks.length; i++) {
          await interaction.followUp({
            content: `📋 **Grupa ${groupNumber}** - część ${i + 1}/${
              chunks.length
            }\n\n${chunks[i]}`,
            flags: 64, // ephemeral flag
          });
        }
      } else {
        // Wyślij całą listę
        await interaction.editReply({
          content: userList,
        });
      }
    } catch (error) {
      console.error("[GRUPA] Błąd:", error);

      if (interaction.deferred) {
        await interaction.editReply({
          content: "❌ Wystąpił błąd podczas pobierania listy użytkowników.",
        });
      } else {
        await interaction.reply({
          content: "❌ Wystąpił błąd podczas pobierania listy użytkowników.",
          flags: 64, // ephemeral flag
        });
      }
    }
  },
};
