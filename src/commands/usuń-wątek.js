const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { checkUserPermissions } = require("../utils/permissions");
const { getPersonalThread, deletePersonalThread } = require("../db/threads");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("usuń-wątek")
    .setDescription("Usuń wątek osobisty konkretnego użytkownika")
    .addUserOption((option) =>
      option
        .setName("użytkownik")
        .setDescription("Użytkownik, którego wątek ma zostać usunięty")
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      // Sprawdź uprawnienia - tylko admin/nauczyciel może usuwać wątki
      const permissions = await checkUserPermissions(interaction, "usuń-wątek");
      if (!permissions.canUseCommand) {
        await interaction.reply({
          content: `❌ ${permissions.reason}`,
          ephemeral: true,
        });
        return;
      }

      const targetUser = interaction.options.getUser("użytkownik");

      await interaction.deferReply();

      // Sprawdź czy użytkownik ma wątek w bazie danych
      const threadData = await getPersonalThread(
        interaction.guild.id,
        targetUser.id
      );

      if (!threadData) {
        const noThreadEmbed = new EmbedBuilder()
          .setTitle("❌ Wątek nie znaleziony")
          .setDescription(
            `Użytkownik ${targetUser} nie ma przypisanego wątku osobistego.`
          )
          .setColor("#FF0000")
          .setTimestamp();

        await interaction.editReply({ embeds: [noThreadEmbed] });
        return;
      }

      // Znajdź kanał wątku na Discordzie
      let discordThread = null;
      try {
        discordThread = await interaction.guild.channels.fetch(
          threadData.thread_id
        );
      } catch (error) {
        console.log(
          `[USUŃ-WĄTEK] Wątek ${threadData.thread_id} nie istnieje na Discordzie (prawdopodobnie już usunięty)`
        );
      }

      let deleteErrors = [];

      // Usuń wątek z Discord (jeśli istnieje)
      if (discordThread) {
        try {
          await discordThread.delete(
            `Usunięcie wątku przez ${interaction.user.tag} za pomocą komendy /usuń-wątek`
          );
        } catch (error) {
          deleteErrors.push(`Discord: ${error.message}`);
          console.error(`[USUŃ-WĄTEK] Błąd usuwania wątku z Discord:`, error);
        }
      }

      // Usuń wątek z bazy danych
      try {
        await deletePersonalThread(interaction.guild.id, targetUser.id);
      } catch (error) {
        deleteErrors.push(`Baza danych: ${error.message}`);
        console.error(`[USUŃ-WĄTEK] Błąd usuwania wątku z bazy:`, error);
      }

      // Przygotuj odpowiedź
      const resultEmbed = new EmbedBuilder().setTimestamp().setFooter({
        text: `Usunięte przez ${interaction.user.displayName}`,
        iconURL: interaction.user.displayAvatarURL(),
      });

      if (deleteErrors.length === 0) {
        // Sukces
        resultEmbed
          .setTitle("✅ Wątek został usunięty")
          .setDescription(
            `**Użytkownik:** ${targetUser}\n` +
              `**Nazwa wątku:** ${threadData.thread_name}\n` +
              `**Status:** Usunięty z Discord i bazy danych`
          )
          .setColor("#00FF00");
      } else {
        // Częściowy sukces lub błąd
        resultEmbed
          .setTitle("⚠️ Wątek częściowo usunięty")
          .setDescription(
            `**Użytkownik:** ${targetUser}\n` +
              `**Nazwa wątku:** ${threadData.thread_name}\n` +
              `**Błędy:**\n${deleteErrors.map((err) => `• ${err}`).join("\n")}`
          )
          .setColor("#FFA500");
      }

      await interaction.editReply({ embeds: [resultEmbed] });
    } catch (error) {
      console.error("[USUŃ-WĄTEK] Nieoczekiwany błąd:", error);

      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Wystąpił błąd")
        .setDescription("Nie udało się usunąć wątku. Spróbuj ponownie później.")
        .setColor("#FF0000")
        .setTimestamp();

      if (interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },
};
