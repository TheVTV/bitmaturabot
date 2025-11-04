const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { checkAllStudentsAttendance } = require("../utils/attendance-monitor");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sprawdź-nieobecności")
    .setDescription("Sprawdź limity nieobecności wszystkich uczniów")
    .setContexts([0]),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle("🔍 Sprawdzanie limitów nieobecności")
        .setDescription(
          "Uruchamiam sprawdzanie limitów nieobecności dla wszystkich uczniów..."
        )
        .setColor("#0099FF")
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Uruchom sprawdzanie limitów
      await checkAllStudentsAttendance(interaction.client);

      const successEmbed = new EmbedBuilder()
        .setTitle("✅ Sprawdzanie zakończone")
        .setDescription(
          "Sprawdzenie limitów nieobecności zostało zakończone.\n\n" +
            "Jeśli wykryto przekroczenia lub ostrzeżenia, odpowiednie powiadomienia zostały wysłane na wątki osobiste uczniów i do adminów."
        )
        .setColor("#00FF00")
        .setTimestamp();

      await interaction.editReply({ embeds: [successEmbed] });
    } catch (error) {
      console.error("[SPRAWDŹ-NIEOBECNOŚCI] Błąd:", error);

      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Błąd")
        .setDescription(
          "Wystąpił błąd podczas sprawdzania limitów nieobecności."
        )
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
