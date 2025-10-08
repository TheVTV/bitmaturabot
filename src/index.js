// Entry point bota Discord
require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  Partials,
} = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");

// Inicjalizacja bazy danych MySQL
const { initDatabase, closeDatabase } = require("./db/database");

// Walidacja env
const REQUIRED_ENV = ["DISCORD_TOKEN", "CLIENT_ID"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Brakuje zmiennych w .env: ${missing.join(", ")}`);
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();

// Ładowanie komend
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js"));
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ("data" in command && "execute" in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(
      `[WARN] Plik ${file} nie eksportuje poprawnie 'data' i 'execute'.`
    );
  }
}

// Ładowanie eventów
const eventsPath = path.join(__dirname, "events");
const eventFiles = fs
  .readdirSync(eventsPath)
  .filter((file) => file.endsWith(".js"));
for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

// Inicjalizacja bazy danych przed logowaniem
initDatabase()
  .then(() => {
    client.login(process.env.DISCORD_TOKEN);
  })
  .catch((error) => {
    console.error(
      "[DB] Nie udało się zainicjalizować bazy danych:",
      error.message
    );
    process.exit(1);
  });

const {
  initializeSheetsAndImport,
} = require("./scripts/import-points-from-sheets");
const GUILD_ID = process.env.GUILD_ID || "1395757947564331180";

// Scheduler zostanie uruchomiony w ready.js z dostępem do klienta

// Inicjalizacja arkuszy przy starcie
initializeSheetsAndImport(GUILD_ID);

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[SHUTDOWN] Zamykanie bota...");
  await closeDatabase();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n[SHUTDOWN] Zamykanie bota...");
  await closeDatabase();
  process.exit(0);
});
