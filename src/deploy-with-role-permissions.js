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

// Załaduj wszystkie komendy
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

async function deployWithPermissions() {
  try {
    console.log(`[PERMISSIONS] Publikuję ${commands.length} komend(y) na serwer...`);
    
    // 1. Wdroż komendy
    const deployedCommands = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );

    console.log(`[PERMISSIONS] ✅ Wdrożono ${deployedCommands.length} komend`);
    
    // 2. Pobierz informacje o serwerze (role)
    const guild = await rest.get(Routes.guild(process.env.GUILD_ID));
    const roles = await rest.get(Routes.guildRoles(process.env.GUILD_ID));
    
    console.log(`[PERMISSIONS] Serwer: ${guild.name}`);
    console.log(`[PERMISSIONS] Znaleziono ${roles.length} ról`);
    
    // 3. Znajdź role
    const roleMap = {};
    roles.forEach(role => {
      roleMap[role.name.toLowerCase()] = role.id;
      console.log(`[PERMISSIONS] Rola: ${role.name} (${role.id})`);
    });
    
    // 4. Ustaw uprawnienia dla każdej komendy
    for (const deployedCommand of deployedCommands) {
      const commandName = deployedCommand.name;
      const permissions = getCommandPermissions(commandName, roleMap);
      
      if (permissions.length > 0) {
        console.log(`[PERMISSIONS] Ustawiam uprawnienia dla /${commandName}:`);
        permissions.forEach(perm => {
          const roleName = Object.keys(roleMap).find(name => roleMap[name] === perm.id);
          console.log(`  - ${roleName}: ${perm.permission ? 'DOZWOLONE' : 'ZABLOKOWANE'}`);
        });
        
        try {
          await rest.put(
            Routes.applicationCommandPermissions(process.env.CLIENT_ID, process.env.GUILD_ID, deployedCommand.id),
            { permissions }
          );
          console.log(`[PERMISSIONS] ✅ Ustawiono uprawnienia dla /${commandName}`);
        } catch (error) {
          console.error(`[PERMISSIONS] ❌ Błąd dla /${commandName}:`, error.message);
        }
      } else {
        console.log(`[PERMISSIONS] /${commandName}: dostępne dla wszystkich`);
      }
    }
    
    console.log("[PERMISSIONS] 🎉 Wszystkie uprawnienia ustawione!");
    
  } catch (error) {
    console.error("[PERMISSIONS ERROR]", error);
    process.exit(1);
  }
}

// Funkcja określająca uprawnienia dla komend bazując na naszej logice
function getCommandPermissions(commandName, roleMap) {
  const permissions = [];
  
  // Komendy publiczne (dostępne dla wszystkich)
  const publicCommands = ['ping'];
  
  // Komendy dla uczniów i wyżej
  const studentCommands = ['profil', 'punkty', 'ranking', 'ranking-grupa', 'kiedy-aktualizacja'];
  
  // Komendy dla prowadzących i wyżej
  const teacherCommands = ['prowadzący', 'grupa', 'synchronizuj-dane', 'niezarejestrowany'];
  
  // Komendy tylko dla adminów
  const adminCommands = [
    'konfiguracja', 'dodaj-prowadzącego', 'dodaj-uczniów', 
    'usuń-ucznia', 'zmien-grupe', 'blokuj-wiadomości', 'dodaj-szkopul-id'
  ];
  
  // /rejestruj - dostępne dla wszystkich (nawet niezarejestrowanych)
  if (commandName === 'rejestruj') {
    return []; // brak ograniczeń = dostępne dla wszystkich
  }
  
  // Komendy publiczne - dostępne dla zarejestrowanych
  if (publicCommands.includes(commandName)) {
    return [
      // Zablokuj dla niezarejestrowanych
      { id: roleMap['niezarejestrowany'], type: 1, permission: false }
    ];
  }
  
  // Komendy studenckie
  if (studentCommands.includes(commandName)) {
    return [
      // Dozwól dla uczniów, prowadzących, adminów
      { id: roleMap['uczeń'], type: 1, permission: true },
      { id: roleMap['prowadzący'], type: 1, permission: true },
      { id: roleMap['admin'], type: 1, permission: true },
      // Zablokuj dla niezarejestrowanych
      { id: roleMap['niezarejestrowany'], type: 1, permission: false }
    ];
  }
  
  // Komendy nauczycielskie
  if (teacherCommands.includes(commandName)) {
    return [
      // Dozwól dla prowadzących i adminów
      { id: roleMap['prowadzący'], type: 1, permission: true },
      { id: roleMap['admin'], type: 1, permission: true },
      // Zablokuj dla uczniów i niezarejestrowanych
      { id: roleMap['uczeń'], type: 1, permission: false },
      { id: roleMap['niezarejestrowany'], type: 1, permission: false }
    ];
  }
  
  // Komendy administracyjne
  if (adminCommands.includes(commandName)) {
    return [
      // Dozwól tylko dla adminów
      { id: roleMap['admin'], type: 1, permission: true },
      // Zablokuj dla wszystkich innych
      { id: roleMap['prowadzący'], type: 1, permission: false },
      { id: roleMap['uczeń'], type: 1, permission: false },
      { id: roleMap['niezarejestrowany'], type: 1, permission: false }
    ];
  }
  
  return []; // domyślnie dostępne dla wszystkich
}

deployWithPermissions();