const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("status-barki")
    .setDescription("Zarządzaj statusem Barki dla systemu głaskania krówci")
    .setContexts([0])
    .addSubcommand((subcommand) =>
      subcommand
        .setName("sprawdź")
        .setDescription("Sprawdź aktualny status Barki")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ustaw")
        .setDescription("Ustaw status Barki")
        .addStringOption((option) =>
          option
            .setName("status")
            .setDescription("Czy Barka została zaśpiewana?")
            .setRequired(true)
            .addChoices(
              { name: "❌ Nie została zaśpiewana", value: "0" },
              { name: "✅ Została zaśpiewana", value: "1" }
            )
        )
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const subcommand = interaction.options.getSubcommand();
      const currentStatus = process.env.BARKA_SUNG === "1";

      if (subcommand === "sprawdź") {
        const embed = new EmbedBuilder()
          .setTitle("🎵 Status Barki")
          .setDescription(
            `**Aktualny status:** ${
              currentStatus
                ? "✅ Została zaśpiewana"
                : "❌ Nie została zaśpiewana"
            }\n\n` +
              `**Wartość w .env:** BARKA_SUNG=${
                process.env.BARKA_SUNG || "nie ustawiona"
              }\n\n` +
              `**Wpływ na system:**\n` +
              `${
                currentStatus
                  ? "• Głaskanie krówci może być kontynuowane bez ograniczeń"
                  : "• 2137-me pogłaskanie jest zablokowane do czasu zaśpiewania Barki"
              }`
          )
          .setColor(currentStatus ? "#00FF00" : "#FF0000")
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      if (subcommand === "ustaw") {
        const newStatus = interaction.options.getString("status");
        const envPath = path.join(__dirname, "..", "..", ".env");

        try {
          // Przeczytaj aktualny plik .env
          let envContent = fs.readFileSync(envPath, "utf8");

          // Zaktualizuj lub dodaj zmienną BARKA_SUNG
          if (envContent.includes("BARKA_SUNG=")) {
            envContent = envContent.replace(
              /BARKA_SUNG=.*$/m,
              `BARKA_SUNG=${newStatus}`
            );
          } else {
            envContent += `\nBARKA_SUNG=${newStatus}`;
          }

          // Zapisz plik
          fs.writeFileSync(envPath, envContent);

          // Zaktualizuj zmienną środowiskową w pamięci
          process.env.BARKA_SUNG = newStatus;

          const isEnabled = newStatus === "1";
          const embed = new EmbedBuilder()
            .setTitle("✅ Status Barki zaktualizowany")
            .setDescription(
              `**Nowy status:** ${
                isEnabled
                  ? "✅ Została zaśpiewana"
                  : "❌ Nie została zaśpiewana"
              }\n\n` +
                `**Wpływ:**\n` +
                `${
                  isEnabled
                    ? "• Głaskanie krówci może być teraz kontynuowane bez ograniczeń! 🎉"
                    : "• 2137-me pogłaskanie zostało zablokowane do czasu zaśpiewania Barki 🚫"
                }\n\n` +
                `*Zmiana została zapisana w pliku .env i jest aktywna natychmiast.*`
            )
            .setColor(isEnabled ? "#00FF00" : "#FF0000")
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] });
        } catch (error) {
          console.error("[STATUS-BARKI] Błąd podczas zapisywania:", error);

          const errorEmbed = new EmbedBuilder()
            .setTitle("❌ Błąd")
            .setDescription(
              "Nie udało się zaktualizować pliku .env. Sprawdź uprawnienia do zapisu."
            )
            .setColor("#FF0000")
            .setTimestamp();

          return interaction.editReply({ embeds: [errorEmbed] });
        }
      }
    } catch (error) {
      console.error("[STATUS-BARKI] Błąd:", error);

      const errorMessage =
        "❌ Wystąpił błąd podczas zarządzania statusem Barki.";

      if (interaction.deferred) {
        await interaction.editReply({ content: errorMessage });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  },
};
