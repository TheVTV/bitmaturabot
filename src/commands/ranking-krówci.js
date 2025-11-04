const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getCowLeaderboard, getCowStats, getTimesWord } = require("../db/cow");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ranking-krówci")
    .setDescription("Zobacz ranking najlepszych głaskaczów krówci! 🐄🏆")
    .setContexts([0]),
  async execute(interaction) {
    try {
      await interaction.deferReply();

      const userId = interaction.user.id;

      // Pobierz ranking i statystyki użytkownika
      const [leaderboard, userStats] = await Promise.all([
        getCowLeaderboard(10),
        getCowStats(userId),
      ]);

      const embed = new EmbedBuilder()
        .setTitle("🐄 Ranking Głaskaczów Krówci 🏆")
        .setColor("#FF69B4")
        .setTimestamp();

      if (leaderboard.length === 0) {
        embed.setDescription(
          "Nikt jeszcze nie pogłaskał krówci! Bądź pierwszy! 🐮"
        );
      } else {
        let description = "";

        for (let i = 0; i < leaderboard.length; i++) {
          const entry = leaderboard[i];
          const user = await interaction.client.users
            .fetch(entry.discord_id)
            .catch(() => null);
          const username = user ? user.displayName : "Nieznany użytkownik";

          let medal = "";
          if (entry.rank === 1) medal = "🥇";
          else if (entry.rank === 2) medal = "🥈";
          else if (entry.rank === 3) medal = "🥉";
          else medal = `**${entry.rank}.**`;

          const timesWord = getTimesWord(entry.pet_count);
          description += `${medal} **${username}** - ${entry.pet_count} ${timesWord}\n`;
        }

        embed.setDescription(description);
      }

      // Dodaj informacje o użytkowniku
      if (userStats.userPets > 0) {
        const userTimesWord = getTimesWord(userStats.userPets);
        embed.addFields({
          name: "📊 Twoje statystyki",
          value:
            `Pogłaskałeś krówcię **${userStats.userPets}** ${userTimesWord}\n` +
            `Twoja pozycja: **#${userStats.userRank}**`,
          inline: false,
        });
      } else {
        embed.addFields({
          name: "📊 Twoje statystyki",
          value: "Jeszcze nie pogłaskałeś krówci! Użyj `/pogłaszcz-krówcię`",
          inline: false,
        });
      }

      // Dodaj łączne statystyki
      const totalTimesWord = getTimesWord(userStats.totalPets);

      embed.addFields({
        name: "🌍 Łączne statystyki",
        value: `Krówcia została pogłaskana **${userStats.totalPets}** ${totalTimesWord} przez wszystkich!`,
        inline: false,
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[RANKING-KRÓWCI] Błąd:", error);

      const errorMessage =
        "❌ Nie udało się pobrać rankingu. Krówcia chyba śpi! 😴";

      if (interaction.deferred) {
        await interaction.editReply({ content: errorMessage });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  },
};
