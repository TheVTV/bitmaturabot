const { Events, MessageFlags } = require("discord.js");
const { checkUserPermissions } = require("../utils/permissions");

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    // Handle modal submissions
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("absence_report_")) {
        const {
          handleAbsenceReportModal,
        } = require("../utils/absence-handler");
        try {
          await handleAbsenceReportModal(interaction);
        } catch (error) {
          console.error("Błąd podczas obsługi zgłoszenia nieobecności:", error);

          // Lepsze obsługi błędów dla modal submission
          try {
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({
                content:
                  "❌ Wystąpił błąd podczas przetwarzania zgłoszenia. Spróbuj ponownie za chwilę.",
                flags: MessageFlags.Ephemeral,
              });
            } else {
              await interaction.editReply({
                content:
                  "❌ Wystąpił błąd podczas przetwarzania zgłoszenia. Spróbuj ponownie za chwilę.",
              });
            }
          } catch (replyError) {
            console.error("Nie można wysłać komunikatu o błędzie:", replyError);
          }
        }
        return;
      }
    }

    if (!interaction.isChatInputCommand()) return;

    // GLOBALNY FILTR UPRAWNIEŃ - sprawdź przed wykonaniem komendy
    try {
      const permissions = await checkUserPermissions(
        interaction,
        interaction.commandName
      );
      if (!permissions.canUseCommand) {
        return interaction.reply({
          content: `❌ **Brak dostępu:** ${permissions.reason}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (error) {
      console.error(`[PERMISSIONS ERROR] ${error.message}`);
      return interaction.reply({
        content: "❌ Błąd podczas sprawdzania uprawnień.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.warn(`Brak komendy: ${interaction.commandName}`);
      return interaction.reply({
        content: "Ta komenda jest nieaktywna.",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      try {
        if (interaction.deferred) {
          await interaction.editReply({
            content: "Wystąpił błąd podczas wykonywania komendy.",
          });
        } else if (interaction.replied) {
          await interaction.followUp({
            content: "Wystąpił błąd podczas wykonywania komendy.",
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: "Wystąpił błąd podczas wykonywania komendy.",
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        console.error("Nie można wysłać komunikatu o błędzie:", replyError);
      }
    }
  },
};
