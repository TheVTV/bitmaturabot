const {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");
const { checkUserPermissions } = require("../utils/permissions");
const { getUserByDiscordId } = require("../db/users_mysql");
const { getGroupDates, findNearestDates } = require("../utils/date-validator");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("kiedy-zajęcia")
    .setDescription("Sprawdź terminy najbliższych zajęć dla Twojej grupy")
    .setDefaultMemberPermissions(null)
    .setContexts([0]),

  async execute(interaction) {
    try {
      // Sprawdź uprawnienia użytkownika PRZED deferReply
      const permissions = await checkUserPermissions(
        interaction,
        "kiedy-zajęcia"
      );
      if (!permissions.canUseCommand) {
        await interaction.reply({
          content: `❌ **Brak dostępu:** ${permissions.reason}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Defer dopiero po sprawdzeniu uprawnień
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Pobierz dane użytkownika z bazy
      const userData = await getUserByDiscordId(interaction.user.id);
      if (!userData) {
        await interaction.editReply({
          content:
            "❌ Nie jesteś zarejestrowany w systemie. Użyj `/rejestruj` aby się zarejestrować.",
        });
        return;
      }

      // Pobierz daty zajęć dla grupy użytkownika
      const groupDates = await getGroupDates(userData.group);

      if (!groupDates || groupDates.length === 0) {
        await interaction.editReply({
          content: `❌ Nie znaleziono harmonogramu zajęć dla grupy ${userData.group}. Możliwe przyczyny:\n• Brak danych w arkuszu grupy\n• Błąd połączenia z arkuszem\n• Grupa nie ma zaplanowanych zajęć`,
        });
        return;
      }

      // Znajdź najbliższe zajęcia (następne 3)
      const nearestDates = findNearestDates(groupDates, 3);

      if (nearestDates.length === 0) {
        await interaction.editReply({
          content: `📅 **Grupa ${userData.group}** - Brak zaplanowanych zajęć w przyszłości.\n\nWszystkie zajęcia zostały już zakończone lub nie ma nowych terminów w harmonogramie.`,
        });
        return;
      }

      // Utworz embed z terminami zajęć
      const embed = new EmbedBuilder()
        .setTitle(`📅 Najbliższe zajęcia - Grupa ${userData.group}`)
        .setColor(0x3498db)
        .setDescription(
          nearestDates.length === 1
            ? `Najbliższe zajęcia dla Twojej grupy:`
            : `Najbliższe ${nearestDates.length} zajęcia dla Twojej grupy:`
        )
        .addFields({
          name: "🗓️ Terminy zajęć",
          value: nearestDates
            .map((date, index) => {
              const emoji = index === 0 ? "🔸" : "▪️";
              return `${emoji} ${date}`;
            })
            .join("\n"),
          inline: false,
        })
        .setFooter({
          text: `Grupa ${userData.group} • ${interaction.user.username}`,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTimestamp();

      // Dodaj informację o najbliższych zajęciach jeśli są dzisiaj lub jutro
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayStr = formatDateToDDMMYYYY(today);
      const tomorrowStr = formatDateToDDMMYYYY(tomorrow);

      if (nearestDates.includes(todayStr)) {
        embed.addFields({
          name: "🚨 Uwaga",
          value: "**Dzisiaj masz zajęcia!**",
          inline: false,
        });
      } else if (nearestDates.includes(tomorrowStr)) {
        embed.addFields({
          name: "⏰ Przypomnienie",
          value: "**Jutro masz zajęcia!**",
          inline: false,
        });
      }

      await interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      console.error("[KIEDY-ZAJĘCIA] Błąd:", error);

      try {
        if (interaction.deferred) {
          await interaction.editReply({
            content:
              "❌ Wystąpił błąd podczas pobierania harmonogramu zajęć. Spróbuj ponownie za chwilę.",
          });
        } else if (!interaction.replied) {
          await interaction.reply({
            content:
              "❌ Wystąpił błąd podczas pobierania harmonogramu zajęć. Spróbuj ponownie za chwilę.",
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        console.error("[KIEDY-ZAJĘCIA] Błąd odpowiedzi:", replyError);
      }
    }
  },
};

/**
 * Formatuje datę z obiektu Date do formatu DD-MM-YYYY
 * @param {Date} date - Obiekt daty
 * @returns {string} - Data w formacie DD-MM-YYYY
 */
function formatDateToDDMMYYYY(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}
