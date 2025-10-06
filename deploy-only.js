require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_ENV = ["DISCORD_TOKEN", "CLIENT_ID", "GUILD_ID"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Brakuje zmiennych w .env: ${missing.join(", ")}`);
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, "src", "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  try {
    const command = require(filePath);
    if ("data" in command && "execute" in command) {
      commands.push(command.data.toJSON());
      console.log(`✅ Załadowano komendę: ${command.data.name}`);
    } else {
      console.warn(`[WARN] ${file} pominięty: brak 'data'/'execute'.`);
    }
  } catch (error) {
    console.error(`[ERROR] Błąd ładowania ${file}:`, error.message);
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(
      `🚀 Rozpoczynam deploy ${commands.length} komend dla serwera...`
    );

    const data = await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log(`✅ Pomyślnie wdrożono ${data.length} komend dla serwera!`);

    // Lista wdrożonych komend
    console.log("\n📋 Wdrożone komendy:");
    data.forEach((cmd) => {
      console.log(`   - /${cmd.name}: ${cmd.description}`);
    });
  } catch (error) {
    console.error("❌ Błąd podczas wdrażania:", error);
  }
})();
