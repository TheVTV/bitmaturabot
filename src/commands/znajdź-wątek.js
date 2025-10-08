const {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");
const { getUserByDiscordId } = require("../db/users_mysql");
const { getPersonalThread } = require("../db/threads");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("znajdź-wątek")
    .setDescription("Znajdź osobisty wątek wybranego ucznia")
    .setContexts([0])
    .addUserOption((option) =>
      option
        .setName("uczeń")
        .setDescription("Uczeń, którego wątek chcesz znaleźć")
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const targetUser = interaction.options.getUser("uczeń");

      // Sprawdź czy podany użytkownik jest zarejestrowany w systemie
      const targetUserData = await getUserByDiscordId(targetUser.id);
      if (!targetUserData) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Użytkownik nie znaleziony")
          .setDescription(
            `Użytkownik ${targetUser} nie jest zarejestrowany w systemie lub nie ma przypisanych danych.`
          )
          .setColor("#FF0000")
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Sprawdź czy użytkownik ma wątek w bazie danych
      const existingThread = await getPersonalThread(
        interaction.guild.id,
        targetUser.id
      );

      if (!existingThread) {
        const embed = new EmbedBuilder()
          .setTitle("🔍 Wątek nie istnieje")
          .setDescription(
            `Użytkownik ${targetUser} nie ma jeszcze utworzonego osobistego wątku.\n\n` +
              `Może utworzyć go samodzielnie używając komendy \`/mój-wątek\`.`
          )
          .setColor("#FFA500")
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Sprawdź czy wątek nadal istnieje na Discordzie
      let thread = null;
      try {
        thread = await interaction.guild.channels.fetch(
          existingThread.thread_id
        );
      } catch (error) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Wątek został usunięty")
          .setDescription(
            `Wątek użytkownika ${targetUser} istnieje w bazie danych, ale został usunięty z Discorda.\n\n` +
              `Użytkownik może utworzyć nowy wątek używając komendy \`/mój-wątek\`.`
          )
          .setColor("#FF0000")
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Wątek istnieje - przekaż link
      const embed = new EmbedBuilder()
        .setTitle("✅ Znaleziono wątek")
        .setDescription(
          `**Użytkownik:** ${targetUser}\n` +
            `**Imię i nazwisko:** ${
              targetUserData.fullname || "Nie podano"
            }\n` +
            `**Grupa:** ${targetUserData.group}\n\n` +
            `**Wątek:** ${thread}\n` +
            `**Nazwa:** ${thread.name}\n\n` +
            `*Kliknij w link powyżej, aby przejść do wątku.*`
        )
        .setColor("#00FF00")
        .setTimestamp()
        .setFooter({
          text: `ID wątku: ${thread.id}`,
        });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[ZNAJDŹ-WĄTEK] Błąd:", error);

      const errorMessage = "❌ Wystąpił błąd podczas wyszukiwania wątku.";

      if (interaction.deferred) {
        await interaction.editReply({ content: errorMessage });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  },
};
