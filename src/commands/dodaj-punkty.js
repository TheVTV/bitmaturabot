const {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { addUserPoints } = require("../db/points");
const { getAdminRoleName, getTeacherRoleName } = require("../db/config_mysql");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dodaj-punkty")
    .setDescription("Dodaj punkty użytkownikowi (dla nauczycieli i administratorów)")
    .addUserOption((option) =>
      option
        .setName("użytkownik")
        .setDescription("Użytkownik który ma otrzymać punkty")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("punkty")
        .setDescription("Liczba punktów do dodania")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1000)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setContexts([0]),

  async execute(interaction) {
    // Sprawdź czy użytkownik ma rolę administratora, nauczyciela lub uprawnienia ManageRoles
    const adminRoleName = await getAdminRoleName(interaction.guild.id);
    const teacherRoleName = await getTeacherRoleName(interaction.guild.id);
    
    const hasAdminRole = interaction.member.roles.cache.some(
      (role) => role.name === adminRoleName
    );
    const hasTeacherRole = interaction.member.roles.cache.some(
      (role) => role.name === teacherRoleName
    );
    const hasManageRolesPermissions = interaction.member.permissions.has(PermissionFlagsBits.ManageRoles);

    if (!hasAdminRole && !hasTeacherRole && !hasManageRolesPermissions) {
      return interaction.reply({
        content: `❌ Ta komenda wymaga roli administratora (**${adminRoleName}**), nauczyciela (**${teacherRoleName}**) lub uprawnień Discord ManageRoles.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetUser = interaction.options.getUser("użytkownik");
    const pointsToAdd = interaction.options.getInteger("punkty");

    // Sprawdź czy target to bot
    if (targetUser.bot) {
      return interaction.reply({
        content: "❌ Nie możesz dodać punktów botowi!",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      // Defer reply bo może potrwać chwilę
      await interaction.deferReply();

      // Dodaj punkty
      const success = await addUserPoints(targetUser.id, interaction.guild.id, pointsToAdd);

      if (success) {
        await interaction.editReply({
          content: `✅ **Punkty dodane!**\n\n` +
                  `👤 **Użytkownik:** ${targetUser}\n` +
                  `➕ **Dodane punkty:** ${pointsToAdd}\n` +
                  `👨‍🏫 **Dodane przez:** ${interaction.user}`
        });

        // Wyślij powiadomienie do użytkownika (opcjonalnie)
        try {
          await targetUser.send(
            `🎉 **Otrzymałeś punkty!**\n\n` +
            `➕ **Punkty:** ${pointsToAdd}\n` +
            `🏫 **Serwer:** ${interaction.guild.name}\n` +
            `👨‍🏫 **Od:** ${interaction.user.tag}`
          );
        } catch (dmError) {
          // Ignoruj błąd jeśli nie można wysłać DM
          console.log(`[POINTS] Nie można wysłać DM do ${targetUser.tag}: ${dmError.message}`);
        }
      } else {
        await interaction.editReply({
          content: "❌ Wystąpił błąd podczas dodawania punktów. Spróbuj ponownie."
        });
      }
    } catch (error) {
      console.error("[DODAJ-PUNKTY] Błąd:", error);
      await interaction.editReply({
        content: "❌ Wystąpił błąd podczas dodawania punktów. Spróbuj ponownie."
      });
    }
  },
};
