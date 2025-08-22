const {
  SlashCommandBuilder,
  MessageFlags,
} = require("discord.js");
const { getUserPoints } = require("../db/points");
const { getAdminRoleName, getTeacherRoleName, getStudentRoleName } = require("../db/config_mysql");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("punkty")
    .setDescription("Sprawdź punkty użytkownika")
    .addUserOption((option) =>
      option
        .setName("użytkownik")
        .setDescription("Użytkownik którego punkty chcesz sprawdzić (opcjonalne)")
        .setRequired(false)
    )
    .setContexts([0]),

  async execute(interaction) {
    // Sprawdź czy użytkownik ma odpowiednią rolę
    const adminRoleName = await getAdminRoleName(interaction.guild.id);
    const teacherRoleName = await getTeacherRoleName(interaction.guild.id);
    const studentRoleName = await getStudentRoleName(interaction.guild.id);
    
    const hasAdminRole = interaction.member.roles.cache.some(
      (role) => role.name === adminRoleName
    );
    const hasTeacherRole = interaction.member.roles.cache.some(
      (role) => role.name === teacherRoleName
    );
    const hasStudentRole = interaction.member.roles.cache.some(
      (role) => role.name === studentRoleName
    );

    if (!hasAdminRole && !hasTeacherRole && !hasStudentRole) {
      return interaction.reply({
        content: `❌ Ta komenda wymaga roli ucznia (**${studentRoleName}**), nauczyciela (**${teacherRoleName}**) lub administratora (**${adminRoleName}**).`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetUser = interaction.options.getUser("użytkownik") || interaction.user;

    // Sprawdź czy target to bot
    if (targetUser.bot) {
      return interaction.reply({
        content: "❌ Boty nie mają punktów!",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      // Defer reply bo może potrwać chwilę
      await interaction.deferReply();

      // Pobierz punkty
      const points = await getUserPoints(targetUser.id, interaction.guild.id);

      const isOwnPoints = targetUser.id === interaction.user.id;
      const title = isOwnPoints ? "Twoje punkty" : `Punkty użytkownika ${targetUser.displayName}`;

      let response = `📊 **${title}**\n\n`;
      response += `👤 **Użytkownik:** ${targetUser}\n`;
      response += `⭐ **Punkty:** ${points}`;

      await interaction.editReply({
        content: response
      });
    } catch (error) {
      console.error("[PUNKTY] Błąd:", error);
      await interaction.editReply({
        content: "❌ Wystąpił błąd podczas pobierania punktów. Spróbuj ponownie."
      });
    }
  },
};
