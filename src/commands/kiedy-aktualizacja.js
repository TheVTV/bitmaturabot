const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const { isSyncRunning, getLastSyncTime } = require("../scripts/data-sync-scheduler");
const { checkUserPermissions } = require("../utils/permissions");
require("dotenv").config({
  path: require("path").join(__dirname, "../../.env"),
});

const TIMEZONE = process.env.TIMEZONE || "Europe/Warsaw";

/**
 * Funkcja do formatowania czasu w określonej strefie czasowej
 */
function formatTimeInTimezone(date = new Date()) {
  return date.toLocaleString("pl-PL", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Funkcja do obliczania następnego uruchomienia schedulera
 */
function getNextScheduledTime() {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);

  return formatTimeInTimezone(nextHour);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("kiedy-aktualizacja")
    .setDescription("Wyświetla informacje o czasie serwera i schedulera")
    .setContexts([0]),

  async execute(interaction) {
    // Sprawdź uprawnienia użytkownika
    const permissions = await checkUserPermissions(
      interaction,
      "kiedy-aktualizacja"
    );
    if (!permissions.canUseCommand) {
      await interaction.reply({
        content: `[UPRAWNIENIA] ${permissions.reason}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const now = new Date();
    const serverTime = now.toLocaleString("pl-PL", { timeZone: "UTC" });
    const localTime = formatTimeInTimezone(now);
    const nextSync = getNextScheduledTime();
    const lastSync = getLastSyncTime();
    const lastSyncText = lastSync 
      ? formatTimeInTimezone(lastSync)
      : "Brak danych (bot nie wykonał jeszcze synchronizacji)";
    const syncStatus = isSyncRunning()
      ? "🔄 Synchronizacja w trakcie"
      : "✅ Gotowy do synchronizacji";

    const embed = new EmbedBuilder()
      .setTitle("ℹ️ Informacje o czasie")
      .setColor(isSyncRunning() ? 0xffaa00 : 0x0099ff)
      .addFields(
        {
          name: "🌐 Czas serwera (UTC)",
          value: serverTime,
          inline: true,
        },
        {
          name: "🇵🇱 Czas lokalny (Polska)",
          value: localTime,
          inline: true,
        },
        {
          name: "⚙️ Strefa czasowa",
          value: TIMEZONE,
          inline: true,
        },
        {
          name: "📊 Stan synchronizacji",
          value: syncStatus,
          inline: false,
        },
        {
          name: "📅 Ostatnia synchronizacja",
          value: lastSyncText,
          inline: false,
        },
        {
          name: "⏰ Następna synchronizacja",
          value: nextSync,
          inline: false,
        },
        {
          name: "📋 Harmonogram",
          value: "Co godzinę o pełnej godzinie (0 minut)",
          inline: false,
        }
      )
      .setTimestamp()
      .setFooter({ text: "System synchronizacji danych" });

    await interaction.reply({ embeds: [embed] });
  },
};
