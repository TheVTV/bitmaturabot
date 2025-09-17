const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Odpowiada Pong!")
    .setContexts([0]),
  async execute(interaction) {
    const sent = await interaction.reply({
      content: "Pong!",
      fetchReply: true,
    });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.followUp({ content: `Opóźnienie: ${latency}ms` });
  },
};
