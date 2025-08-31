const {
  SlashCommandBuilder,
  MessageFlags,
} = require("discord.js");
const { getTopUsers, getTotalUsers } = require("../db/points");
const { getAdminRoleName, getTeacherRoleName, getStudentRoleName } = require("../db/config_mysql");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ranking")
    .setDescription("Wyświetl ranking punktów (top 10)")
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

    try {
      // Defer reply bo może potrwać chwilę
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }

      // Pobierz top użytkowników i całkowitą liczbę
      const [topUsers, totalUsers] = await Promise.all([
        getTopUsers(interaction.guild.id, 10),
        getTotalUsers(interaction.guild.id)
      ]);

      if (!topUsers || topUsers.length === 0) {
        await interaction.editReply({
          content: "📊 **Ranking punktów**\n\n❌ Brak użytkowników z punktami na tym serwerze."
        });
        return;
      }

      // Zbuduj ranking
      let response = `🏆 **Ranking punktów - Top ${topUsers.length}**\n\n`;
      
      const medals = ["🥇", "🥈", "🥉"];
      
      for (let i = 0; i < topUsers.length; i++) {
        const user = topUsers[i];
        const position = i + 1;
        
        // Pobierz użytkownika Discord
        let displayName = "Nieznany użytkownik";
        try {
          const discordUser = await interaction.guild.members.fetch(user.discord_id);
          displayName = discordUser.displayName || discordUser.user.username;
        } catch (error) {
          // Użytkownik nie jest już na serwerze
          displayName = `Użytkownik opuścił serwer`;
        }

        const medal = medals[i] || `${position}.`;
        const pointsText = user.points === 1 ? "punkt" : user.points < 5 ? "punkty" : "punktów";
        
        response += `${medal} **${displayName}** - ${user.points} ${pointsText}\n`;
      }

      response += `\n📈 **Statystyki:** ${totalUsers} użytkowników z punktami`;
      
      // Dodaj pozycję aktualnego użytkownika jeśli nie jest w top 10
      const userInTop = topUsers.find(u => u.discord_id === interaction.user.id);
      if (!userInTop && totalUsers > 10) {
        try {
          const { getUserRank, getUserPoints } = require("../db/points");
          const [userRank, userPoints] = await Promise.all([
            getUserRank(interaction.user.id, interaction.guild.id),
            getUserPoints(interaction.user.id, interaction.guild.id)
          ]);
          
          if (userRank && userPoints > 0) {
            const pointsText = userPoints === 1 ? "punkt" : userPoints < 5 ? "punkty" : "punktów";
            response += `\n\n👤 **Twoja pozycja:** ${userRank}. miejsce (${userPoints} ${pointsText})`;
          }
        } catch (error) {
          // Ignoruj błąd
        }
      }

      await interaction.editReply({
        content: response
      });
    } catch (error) {
      console.error("[RANKING] Błąd:", error);
      
      try {
        if (interaction.deferred) {
          await interaction.editReply({
            content: "❌ Wystąpił błąd podczas pobierania rankingu. Spróbuj ponownie."
          });
        } else if (!interaction.replied) {
          await interaction.reply({
            content: "❌ Wystąpił błąd podczas pobierania rankingu. Spróbuj ponownie.",
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        console.error("[RANKING] Błąd odpowiedzi:", replyError.message);
      }
    }
  },
};
