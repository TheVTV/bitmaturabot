const { Events } = require("discord.js");

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    // Log nowego członka
    console.log(`[JOIN] ${member.user.tag} dołączył do ${member.guild.name}`);

    // Pobierz config serwera z bazy MySQL
    const { getUnregisteredRoleId } = require("../db/config_mysql");
    const unregisteredRoleId = await getUnregisteredRoleId(member.guild.id);

    if (unregisteredRoleId) {
      const role = member.guild.roles.cache.get(unregisteredRoleId);
      if (role) {
        try {
          await member.roles.add(role, "Nowy użytkownik - niezarejestrowany");
          console.log(
            `[JOIN] Dodano rolę niezarejestrowany (${role.name}) dla ${member.user.tag}`
          );
        } catch (err) {
          console.error(
            `[JOIN] Błąd dodawania roli niezarejestrowany:`,
            err.message
          );
        }
      } else {
        console.warn(
          `[JOIN] Nie znaleziono roli niezarejestrowany o ID ${unregisteredRoleId}`
        );
      }
    }
  },
};
