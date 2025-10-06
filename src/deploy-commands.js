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
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ("data" in command && "execute" in command) {
    commands.push(command.data.toJSON());
  } else {
    console.warn(`[WARN] ${file} pominięty: brak 'data'/'execute'.`);
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

async function deploy() {
  try {
    console.log(
      `Publikuję ${commands.length} komend(y) na serwerze ${process.env.GUILD_ID}...`
    );
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      {
        body: commands,
      }
    );
    console.log("✅ Gotowe. Komendy serwerowe są dostępne natychmiast!");
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

deploy();
