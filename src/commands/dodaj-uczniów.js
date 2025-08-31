const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { addPending } = require("../state/pending");
const { getAdminRoleName } = require("../db/config_mysql");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dodaj-uczniów")
    .setDescription("Dodaj uczniów z pliku .txt (wymaga roli administratora)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts([0]),
  async execute(interaction) {
    // Sprawdź czy użytkownik ma rolę administratora z konfiguracji lub jest właścicielem serwera
    const adminRoleName = await getAdminRoleName(interaction.guild.id);
    const hasAdminRole = interaction.member.roles.cache.some(
      (role) => role.name === adminRoleName
    );
    const isOwner = interaction.user.id === interaction.guild.ownerId;

    if (!hasAdminRole && !isOwner) {
      return await interaction.reply({
        content: `❌ Ta komenda wymaga roli administratora (**${adminRoleName}**) lub uprawnień właściciela serwera.`,
        flags: 64, // MessageFlags.Ephemeral
      });
    }

    try {
      // Utwórz prywatny wątek dla importu uczniów
      const thread = await interaction.channel.threads.create({
        name: `📚 Import uczniów - ${interaction.user.username}`,
        autoArchiveDuration: 60, // 1 godzina
        type: 12, // ChannelType.PrivateThread
        reason: "Import uczniów z pliku .txt",
      });

      // Dodaj użytkownika do wątku
      await thread.members.add(interaction.user.id);

      // Ustaw stan oczekujący na plik
      addPending(interaction.user.id, {
        type: "import_users",
        guildId: interaction.guild.id,
        threadId: thread.id,
        userId: interaction.user.id,
        startTime: Date.now(),
      });

      // Odpowiedź na komendę
      await interaction.reply({
        content: `✅ Utworzono prywatny wątek ${thread} do importu uczniów!`,
        flags: 64, // MessageFlags.Ephemeral
      });

      // Wyślij instrukcje do wątku
      await thread.send({
        content: `👋 **Witaj w wątku importu uczniów!**

📋 **Instrukcje:**
1. Przygotuj plik **.txt** z listą uczniów
2. **Prześlij plik** do tego wątku
3. Bot automatycznie zaimportuje uczniów

📝 **Format pliku:**
\`\`\`
Jan Kowalski;jan.kowalski@example.com;1
Anna Nowak;anna.nowak@example.com;2
Piotr Wiśniewski;piotr.wisniewski@example.com;1
\`\`\`

⚠️ **Zasady:**
• Każda osoba w **osobnej linii**
• Dane oddzielone **średnikami** (;)
• Format: **Imię Nazwisko;email;grupa**
• Email musi zawierać **@**
• Numer grupy to **liczba** (1, 2, 3...)

🤖 Wyślij plik, a ja zajmę się resztą!`,
      });
    } catch (error) {
      console.error("[DODAJ-UCZNIÓW] Błąd tworzenia wątku:", error);

      await interaction.reply({
        content:
          "❌ Wystąpił błąd podczas tworzenia wątku importu. Spróbuj ponownie.",
        flags: 64, // MessageFlags.Ephemeral
      });
    }
  },
};
