const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { addPending } = require("../state/pending");
const { getAdminRoleName } = require("../db/config_mysql");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dodaj-indeks")
    .setDescription(
      "Dodaj numery indeksów z pliku .txt (wymaga roli administratora)"
    )
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
      // Utwórz prywatny wątek dla importu numerów indeksów
      const thread = await interaction.channel.threads.create({
        name: `🎓 Import indeksów - ${interaction.user.username}`,
        autoArchiveDuration: 60, // 1 godzina
        type: 12, // ChannelType.PrivateThread
        reason: "Import numerów indeksów z pliku .txt",
      });

      // Dodaj użytkownika do wątku
      await thread.members.add(interaction.user.id);

      // Ustaw stan oczekujący na plik
      addPending(interaction.user.id, {
        type: "import_indeks",
        guildId: interaction.guild.id,
        threadId: thread.id,
        userId: interaction.user.id,
        startTime: Date.now(),
      });

      // Odpowiedź na komendę
      await interaction.reply({
        content: `✅ Utworzono prywatny wątek ${thread} do importu numerów indeksów!`,
        flags: 64, // MessageFlags.Ephemeral
      });

      // Wyślij instrukcje do wątku
      await thread.send({
        content: `👋 **Witaj w wątku importu numerów indeksów!**

📋 **Instrukcje:**
1. Przygotuj plik **.txt** z listą numerów indeksów
2. **Prześlij plik** do tego wątku
3. Bot automatycznie zaktualizuje numery indeksów

📝 **Format pliku:**
\`\`\`
jan.kowalski@example.com;123456A
anna.nowak@example.com;789012B
piotr.wisniewski@example.com;345678C
\`\`\`

⚠️ **Zasady:**
• Każda osoba w **osobnej linii**
• Dane oddzielone **średnikami** (;)
• Format: **email;numer_indeksu**
• Email musi zawierać **@**
• Numer indeksu: **litery i cyfry** (np. 123456A, AB12345)

🤖 Wyślij plik, a ja zajmę się resztą!`,
      });
    } catch (error) {
      console.error("[DODAJ-INDEKS] Błąd tworzenia wątku:", error);

      await interaction.reply({
        content:
          "❌ Wystąpił błąd podczas tworzenia wątku importu. Spróbuj ponownie.",
        flags: 64, // MessageFlags.Ephemeral
      });
    }
  },
};
