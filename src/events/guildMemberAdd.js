const { Events } = require("discord.js");

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    // Opcjonalnie: log nowego członka
    console.log(`[JOIN] ${member.user.tag} dołączył do ${member.guild.name}`);
  },
};
