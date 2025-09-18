require("dotenv").config();
const { REST, Routes } = require("discord.js");

const REQUIRED_ENV = ["DISCORD_TOKEN", "CLIENT_ID"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Brakuje zmiennych w .env: ${missing.join(", ")}`);
  process.exit(1);
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

async function clearGlobalCommands() {
  try {
    console.log("[CLEAR] Usuwam wszystkie globalne komendy...");

    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: [], // Pusta tablica usuwa wszystkie komendy
    });

    console.log("[CLEAR] ✅ Wszystkie globalne komendy zostały usunięte!");
    console.log("[CLEAR] Teraz tylko guild commands będą widoczne.");
  } catch (error) {
    console.error("[CLEAR ERROR]", error);
    process.exit(1);
  }
}

clearGlobalCommands();
