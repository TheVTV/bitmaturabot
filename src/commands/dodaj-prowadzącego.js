const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getAllTeachers, setTeacherForGroup } = require("../db/teachers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dodaj-prowadzącego")
    .setDescription("Przypisz prowadzącego do grupy")
    .setContexts([0])
    .addUserOption((option) =>
      option
        .setName("prowadzący")
        .setDescription("Ping prowadzącego (osoba do przypisania)")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("grupa")
        .setDescription("Numer grupy")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(99)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const leaderUser = interaction.options.getUser("prowadzący");
    const groupId = interaction.options.getInteger("grupa");

    await interaction.deferReply({ ephemeral: true });
    try {
      const teachers = await getAllTeachers();
      const alreadyAssigned = teachers.find((t) => t.group_id === groupId);
      if (alreadyAssigned) {
        await interaction.editReply(
          `❌ Grupa **${groupId}** ma już przypisanego prowadzącego: <@${alreadyAssigned.discord_id}>.`
        );
        return;
      }
      await setTeacherForGroup(groupId, leaderUser.id);
      await interaction.editReply(
        `✅ Dodano prowadzącego <@${leaderUser.id}> do grupy **${groupId}**.`
      );
    } catch (error) {
      console.error("[DODAJ-PROWADZĄCEGO] Błąd:", error);
      await interaction.editReply(
        "❌ Wystąpił błąd podczas przypisywania prowadzącego."
      );
    }
  },
};
