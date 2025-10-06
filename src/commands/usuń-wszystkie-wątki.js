const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { checkUserPermissions } = require("../utils/permissions");
const {
  getAllActiveThreads,
  deactivatePersonalThread,
} = require("../db/threads");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("usuń-wszystkie-wątki")
    .setDescription("Usuń wszystkie wątki osobiste (tylko administratorzy)"),

  async execute(interaction) {
    try {
      // Sprawdź uprawnienia administratora
      const hasPermission = await checkUserPermissions(
        interaction,
        "usuń-wszystkie-wątki"
      );
      if (!hasPermission) {
        await interaction.reply({
          content:
            "❌ Nie masz uprawnień do tej komendy. Wymagana rola administratora.",
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply();

      // Znajdź kanał #wątki-osobiste
      const targetChannel = interaction.guild.channels.cache.find(
        (channel) => channel.name === "wątki-osobiste"
      );

      if (!targetChannel) {
        await interaction.editReply({
          content: "❌ Nie znaleziono kanału #wątki-osobiste",
        });
        return;
      }

      // Pobierz wszystkie aktywne wątki z bazy danych
      const activeThreads = await getAllActiveThreads(interaction.guild.id);

      if (activeThreads.length === 0) {
        await interaction.editReply({
          content: "ℹ️ Nie znaleziono aktywnych wątków osobistych do usunięcia",
        });
        return;
      }

      let deleted = 0;
      let errors = 0;
      const errorDetails = [];

      // Usuń każdy wątek
      for (const threadData of activeThreads) {
        try {
          // Znajdź wątek na Discordzie
          const thread = interaction.guild.channels.cache.get(
            threadData.thread_id
          );

          if (thread) {
            // Usuń wątek z Discord
            await thread.delete(
              "Usunięcie wszystkich wątków osobistych przez administratora"
            );
          }

          // Dezaktywuj w bazie danych
          await deactivatePersonalThread(
            interaction.guild.id,
            threadData.user_discord_id
          );
          deleted++;
        } catch (error) {
          errors++;
          errorDetails.push(
            `Wątek ${threadData.thread_name}: ${error.message}`
          );
        }
      }

      // Podsumowanie
      const summaryEmbed = new EmbedBuilder()
        .setTitle("🗑️ Usuwanie wątków zakończone")
        .addFields(
          {
            name: "📊 Statystyki",
            value: `**Usunięte:** ${deleted}\n**Błędy:** ${errors}`,
            inline: true,
          },
          {
            name: "🎯 Przetworzono",
            value: `${activeThreads.length} wątków`,
            inline: true,
          }
        )
        .setColor(errors > 0 ? 0xe67e22 : 0x2ecc71)
        .setTimestamp();

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
      console.error("Błąd w komendzie usuń-wszystkie-wątki:", error);
      await interaction.editReply({
        content: "❌ Wystąpił błąd podczas usuwania wątków.",
      });
    }
  },
};
