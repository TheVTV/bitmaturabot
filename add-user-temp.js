// Ustaw zmienne środowiskowe bezpośrednio
process.env.DATABASE_URL =
  "jdbc:mysql://u28653_BRUH85ShPw:WrzF98%402%2BrM5VZzwvGeZHbNi@65.21.61.192:3306/s28653_MAIN";
process.env.ENCRYPTION_KEY =
  "1a053fc0b0cb40a0cf419e2e66a327fdf1600be0cf2a3ce5db15303dab54db3f";
process.env.SEARCH_SALT = "d8f4e7c2b8a96541fe3d892c05764e32";

const { addUser, getUserByEmail } = require("./src/db/users_mysql");
const { initDatabase } = require("./src/db/database");

(async () => {
  try {
    await initDatabase();
    console.log("✅ Baza danych zainicjalizowana");

    // Dodaj użytkownika
    console.log("Dodaję użytkownika...");
    await addUser(
      "kuba@sds.knurow.com",
      "5",
      "Kuba Kwolek",
      "476322514696667138",
      "K041"
    );

    console.log("✅ Użytkownik dodany!");

    // Sprawdź czy został dodany
    console.log("Sprawdzam czy użytkownik został dodany...");
    const userData = await getUserByEmail("kuba@sds.knurow.com");

    if (userData) {
      console.log("✅ Użytkownik znaleziony w bazie:");
      console.log("  - Email:", userData.email || "kuba@sds.knurow.com");
      console.log("  - Grupa:", userData.group_number);
      console.log("  - Imię:", userData.fullname);
      console.log("  - Discord ID:", userData.discord_id);
      console.log("  - Indeks:", userData.numer_indeksu);
    } else {
      console.log("❌ Użytkownik nie został znaleziony");
    }

    process.exit(0);
  } catch (err) {
    console.error("❌ Błąd:", err.message);
    process.exit(1);
  }
})();
