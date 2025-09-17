const {
  getStudentRoleName,
  getTeacherRoleName,
  getAdminRoleName,
  getUnregisteredRoleId,
} = require("../db/config_mysql");

/**
 * Sprawdza czy użytkownik ma określoną rolę
 * @param {GuildMember} member - Członek serwera
 * @param {string} roleName - Nazwa roli do sprawdzenia
 * @returns {boolean}
 */
function hasRole(member, roleName) {
  return member.roles.cache.some(
    (role) => role.name.toLowerCase() === roleName.toLowerCase()
  );
}

/**
 * Sprawdza typ użytkownika i zwraca informacje o dostępnych komendach
 * @param {CommandInteraction} interaction
 * @returns {Promise<{userType: string, canUseCommand: boolean, reason?: string}>}
 */
async function checkUserPermissions(interaction, commandName) {
  const member = interaction.member;
  const guildId = interaction.guild.id;

  // Pobierz nazwy ról z konfiguracji
  const studentRoleName = await getStudentRoleName(guildId);
  const teacherRoleName = await getTeacherRoleName(guildId);
  const adminRoleName = await getAdminRoleName(guildId);
  const unregisteredRoleId = await getUnregisteredRoleId(guildId);

  const isStudent = hasRole(member, studentRoleName);
  const isTeacher = hasRole(member, teacherRoleName);
  const isAdmin = hasRole(member, adminRoleName);
  const isUnregistered =
    unregisteredRoleId && member.roles.cache.has(unregisteredRoleId);

  // Komendy dostępne dla wszystkich zarejestrowanych użytkowników
  const publicCommands = ["ping"];

  // Komendy dla uczniów i wyżej
  const studentCommands = [
    "profil",
    "punkty",
    "ranking",
    "ranking-grupa",
    "grupa",
    "kiedy-aktualizacja",
    "dodaj-szkopul-id",
  ];

  // Komendy dla prowadzących i wyżej
  const teacherCommands = ["prowadzący", "synchronizuj-dane"];

  // Komendy tylko dla adminów
  const adminCommands = [
    "konfiguracja",
    "niezarejestrowany",
    "dodaj-prowadzącego",
    "dodaj-uczniów",
    "usuń-ucznia",
    "zmien-grupe",
    "blokuj-wiadomości",
  ];

  // Jeśli użytkownik jest niezarejestrowany
  if (isUnregistered || (!isStudent && !isTeacher && !isAdmin)) {
    if (commandName === "rejestruj") {
      return { userType: "unregistered", canUseCommand: true };
    }
    return {
      userType: "unregistered",
      canUseCommand: false,
      reason: "Musisz się zarejestrować. Użyj komendy `/rejestruj`.",
    };
  }

  // Jeśli użytkownik jest zarejestrowany ale próbuje użyć komendy rejestruj
  if (commandName === "rejestruj" && (isStudent || isTeacher || isAdmin)) {
    return {
      userType: isAdmin ? "admin" : isTeacher ? "teacher" : "student",
      canUseCommand: false,
      reason: "Jesteś już zarejestrowany w systemie.",
    };
  }

  // Admin ma dostęp do wszystkich komend
  if (isAdmin) {
    return { userType: "admin", canUseCommand: true };
  }

  // Prowadzący ma dostęp do komend ucznia + swoich komend + publicznych
  if (isTeacher) {
    if (adminCommands.includes(commandName)) {
      return {
        userType: "teacher",
        canUseCommand: false,
        reason: "Ta komenda jest dostępna tylko dla administratorów.",
      };
    }
    // Prowadzący ma dostęp do wszystkich komend ucznia + swoich
    if (
      publicCommands.includes(commandName) ||
      studentCommands.includes(commandName) ||
      teacherCommands.includes(commandName)
    ) {
      return { userType: "teacher", canUseCommand: true };
    }
    return {
      userType: "teacher",
      canUseCommand: false,
      reason: "Nie masz uprawnień do tej komendy.",
    };
  }

  // Uczeń ma dostęp do swoich komend + publicznych
  if (isStudent) {
    if (
      publicCommands.includes(commandName) ||
      studentCommands.includes(commandName)
    ) {
      return { userType: "student", canUseCommand: true };
    }
    return {
      userType: "student",
      canUseCommand: false,
      reason: "Nie masz uprawnień do tej komendy.",
    };
  }

  // Fallback - brak roli
  return {
    userType: "unknown",
    canUseCommand: false,
    reason:
      "Nie masz przypisanej żadnej roli. Skontaktuj się z administratorem.",
  };
}

module.exports = {
  hasRole,
  checkUserPermissions,
};
