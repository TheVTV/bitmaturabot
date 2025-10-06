const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");
const { petCow, getTimesWord } = require("../db/cow");
const path = require("path");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pogłaszcz-krówcię")
    .setDescription("Pogłaszcz wirtualną krówcię! 🐄")
    .setContexts([0]),
  async execute(interaction) {
    try {
      await interaction.deferReply();

      const userId = interaction.user.id;

      // Pogłaszcz krówcię i pobierz statystyki
      const result = await petCow(userId);

      // Sprawdź czy użytkownik jest na cooldown
      if (result.onCooldown) {
        const minutes = Math.floor(result.remainingTime / 60);
        const seconds = result.remainingTime % 60;

        const timeString =
          minutes > 0 ? `${minutes} min ${seconds} sek` : `${seconds} sek`;

        const cooldownEmbed = new EmbedBuilder()
          .setTitle("⏰ Spokojnie z tym głaskaniem!")
          .setDescription(
            `Krówcia potrzebuje odpoczynku! 🐄💤\n\n` +
              `Możesz ją pogłaskać ponownie za: **${timeString}**\n\n` +
              `Dotychczas pogłaskałeś krówcię **${
                result.userPets
              }** ${getTimesWord(result.userPets)}! 🎉`
          )
          .setColor("#FFA500")
          .setTimestamp();

        return interaction.editReply({ embeds: [cooldownEmbed] });
      }

      const { userPets, totalPets } = result;

      // Różne emotikony i wiadomości w zależności od liczby pogłaszeń
      const cowEmojis = ["🐄", "🐮", "🥰", "💕", "✨"];
      const randomEmoji =
        cowEmojis[Math.floor(Math.random() * cowEmojis.length)];

      let specialMessage = "";
      let embedColor = "#FF69B4"; // Różowy domyślny

      if (userPets === 1) {
        specialMessage = "🎉 **To Twoje pierwsze pogłaskanie krówci!**";
        embedColor = "#FFD700"; // Złoty dla pierwszego razu
      } else if (userPets === 10) {
        specialMessage = "🏆 **Gratulacje! Pogłaskałeś krówcię już 10 razy!**";
        embedColor = "#FFA500"; // Pomarańczowy
      } else if (userPets === 50) {
        specialMessage = "🌟 **Niesamowite! 50 pogłaszeń krówci!**";
        embedColor = "#9370DB"; // Fioletowy
      } else if (userPets === 100) {
        specialMessage = "👑 **LEGENDA! 100 pogłaszeń krówci!**";
        embedColor = "#FF0000"; // Czerwony dla legendy
      } else if (userPets % 25 === 0) {
        specialMessage = `⭐ **Milestone! ${userPets} pogłaszeń!**`;
        embedColor = "#00FF00"; // Zielony dla milestone'ów
      }

      const userTimesWord = getTimesWord(userPets);
      const totalTimesWord = getTimesWord(totalPets);

      // Utwórz embed
      const embed = new EmbedBuilder()
        .setTitle(`${randomEmoji} Krówcia została pogłaskana! ${randomEmoji}`)
        .setColor(embedColor)
        .setDescription(
          `🤗 **Ty:** Pogłaskałeś krówcię **${userPets}** ${userTimesWord}\n` +
            `🌍 **Wszyscy:** Krówcia została pogłaskana **${totalPets}** ${totalTimesWord} łącznie`
        )
        .setImage("attachment://krowcia.gif")
        .setTimestamp()
        .setFooter({
          text: `Pogłaskane przez ${interaction.user.displayName}`,
          iconURL: interaction.user.displayAvatarURL(),
        });

      // Dodaj specjalną wiadomość jeśli istnieje
      if (specialMessage) {
        embed.addFields({
          name: "🎉 Specjalne osiągnięcie!",
          value: specialMessage,
          inline: false,
        });
      }

      // Utwórz attachment z gifem krówci
      const cowGifPath = path.join(__dirname, "..", "assets", "krowcia.gif");
      const attachment = new AttachmentBuilder(cowGifPath, {
        name: "krowcia.gif",
      });

      await interaction.editReply({
        embeds: [embed],
        files: [attachment],
      });
    } catch (error) {
      console.error("[POGŁASZCZ-KRÓWCIĘ] Błąd:", error);

      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Ups! Krówcia uciekła!")
        .setDescription("Spróbuj ponownie za chwilę.")
        .setColor("#FF0000");

      if (interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },
};
