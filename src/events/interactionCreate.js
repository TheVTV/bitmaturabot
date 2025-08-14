const { Events, MessageFlags } = require("discord.js");

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (!interaction.isChatInputCommand()) return;

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
