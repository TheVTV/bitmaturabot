const {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { getAllTeachers } = require("../db/teachers");
const { getTeacherRoleName } = require("../db/config_mysql");
const { checkUserPermissions } = require("../utils/permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("prowadzący")
    .setDescription("Wyświetl listę prowadzących przypisanych do grup")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages) // Dla nauczycieli i administratorów
    .setContexts([0]),

  async execute(interaction) {
    // Sprawdź uprawnienia użytkownika
    const permissions = await checkUserPermissions(interaction, "prowadzący");
    if (!permissions.canUseCommand) {
      await interaction.reply({
        content: `[UPRAWNIENIA] ${permissions.reason}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

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
      for (const { group_number, discord_id } of teachers) {
        response += `• Grupa **${group_number}**: <@${discord_id}>\n`;
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
