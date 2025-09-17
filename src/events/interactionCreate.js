const { Events, MessageFlags } = require("discord.js");
const { checkUserPermissions } = require("../utils/permissions");

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (!interaction.isChatInputCommand()) return;

    // GLOBALNY FILTR UPRAWNIEŃ - sprawdź przed wykonaniem komendy
    try {
      const permissions = await checkUserPermissions(interaction, interaction.commandName);
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
      if (interaction.deferred || interaction.replied) {
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
    }
  },
};
