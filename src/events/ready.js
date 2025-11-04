const { Events } = require("discord.js");
const { startScheduler } = require("../scripts/data-sync-scheduler");

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`Zalogowano jako ${client.user.tag}`);

    // Uruchom scheduler z dostępem do klienta Discord
    console.log("🕐 Uruchamiam scheduler synchronizacji danych...");
    startScheduler(false, client); // false = nie uruchamiaj natychmiast, przekaż klienta
  },
};
