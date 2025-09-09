const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { getAllTeachers } = require("../db/teachers");
const { getTeacherRoleName } = require("../db/config_mysql");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("prowadzący")
    .setDescription("Wyświetl listę prowadzących przypisanych do grup"),

  async execute(interaction) {
    // Sprawdź czy użytkownik ma rolę prowadzącego (nauczyciela)
    const teacherRoleName = await getTeacherRoleName(interaction.guild.id);
    const hasTeacherRole = interaction.member.roles.cache.some(
      (role) => role.name === teacherRoleName
    );
    if (!hasTeacherRole) {
      await interaction.reply({
        content: `❌ Ta komenda wymaga roli prowadzącego (**${teacherRoleName}**).`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    try {
      await interaction.deferReply({ ephemeral: true });
      const teachers = await getAllTeachers();
      if (!teachers.length) {
        await interaction.editReply("Brak przypisanych prowadzących do grup.");
        return;
      }
      let response = "👨‍🏫 **Lista prowadzących przypisanych do grup:**\n\n";
      for (const { group_id, discord_id } of teachers) {
        response += `• Grupa **${group_id}**: <@${discord_id}>\n`;
      }
      await interaction.editReply(response);
    } catch (error) {
      console.error("[PROWADZĄCY] Błąd:", error);
      await interaction.editReply(
        "❌ Wystąpił błąd podczas pobierania prowadzących."
      );
    }
  },
};
