const cron = require("node-cron");
require("dotenv").config({
  path: require("path").join(__dirname, "../../.env"),
});

// Import funkcji
const { importSzkopulData } = require("./szkopul-import");
const { initializeSheetsAndImport } = require("./import-points-from-sheets");

// Konfiguracja
const GUILD_ID = process.env.GUILD_ID;
const TIMEZONE = process.env.TIMEZONE || "Europe/Warsaw";

// Mutex dla synchronizacji
let isSyncInProgress = false;
let lastSuccessfulSync = null;

/**
 * Funkcja do formatowania czasu w określonej strefie czasowej
 */
function formatTimeInTimezone(date = new Date()) {
  return date.toLocaleString("pl-PL", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Funkcja do obliczania następnego uruchomienia schedulera
 */
function getNextScheduledTime() {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);

  return formatTimeInTimezone(nextHour);
}

/**
 * Funkcja wykonująca pełny cykl synchronizacji danych
 */
async function performDataSync() {
  // Sprawdź czy synchronizacja już trwa
  if (isSyncInProgress) {
    const currentTime = formatTimeInTimezone();
    console.log(
      `[SYNC] [${currentTime}] Synchronizacja już w trakcie - pomijam uruchomienie`
    );
    return false; // Zwróć false jeśli synchronizacja została pominięta
  }

  // Ustaw blokadę
  isSyncInProgress = true;

  const startTime = new Date();
  console.log(
    `\n[SYNC] [${formatTimeInTimezone(
      startTime
    )}] Rozpoczynam synchronizację danych...`
  );

  try {
    // KROK 1: Import danych ze Szkopuł do arkuszy Google Sheets
    console.log("[SYNC] KROK 1: Import danych ze Szkopuł do arkuszy...");
    await importSzkopulData();

    // Dodaj krótkie opóźnienie między krokami
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // KROK 2: Import danych z arkuszy do cache i bazy danych
    console.log("[SYNC] KROK 2: Import danych z arkuszy do systemu...");
    await initializeSheetsAndImport(GUILD_ID);

    const endTime = new Date();
    const duration = Math.round((endTime - startTime) / 1000);
    
    // Zapisz czas ostatniej udanej synchronizacji
    lastSuccessfulSync = endTime;
    
    console.log(
      `[SYNC] [${formatTimeInTimezone(
        endTime
      )}] Synchronizacja zakończona pomyślnie (${duration}s)`
    );
    return true; // Zwróć true jeśli synchronizacja się udała
  } catch (error) {
    const endTime = new Date();
    console.error(
      `[SYNC] [${formatTimeInTimezone(endTime)}] Błąd podczas synchronizacji:`,
      error.message
    );
    return false; // Zwróć false jeśli wystąpił błąd
  } finally {
    // Zawsze zwolnij blokadę
    isSyncInProgress = false;
  }
}

/**
 * Funkcja uruchamiająca scheduler
 * @param {boolean} runImmediately - czy uruchomić synchronizację natychmiast
 */
function startScheduler(runImmediately = true) {
  console.log(
    `[SCHEDULER] Scheduler synchronizacji: co godzinę o pełnej godzinie (${TIMEZONE})`
  );
  console.log(`[SCHEDULER] Aktualny czas: ${formatTimeInTimezone()}`);
  console.log(`[SCHEDULER] Następne uruchomienie: ${getNextScheduledTime()}`);

  // Uruchom co godzinę o pełnej godzinie (0 minut)
  cron.schedule(
    "0 * * * *",
    async () => {
      await performDataSync();
    },
    {
      scheduled: true,
      timezone: TIMEZONE,
    }
  );

  // Opcjonalnie: uruchom natychmiast przy starcie
  if (runImmediately) {
    console.log("[SCHEDULER] Wykonuję początkową synchronizację...");
    performDataSync();
  }
}

/**
 * Funkcja uruchamiająca jednorazową synchronizację (dla testów)
 */
/**
 * Funkcja sprawdzająca czy synchronizacja jest w trakcie
 */
function isSyncRunning() {
  return isSyncInProgress;
}

/**
 * Funkcja zwracająca czas ostatniej udanej synchronizacji
 */
function getLastSyncTime() {
  return lastSuccessfulSync;
}

/**
 * Funkcja jednorazowej synchronizacji (dla testów)
 */
async function runOnceSync() {
  console.log("[TEST] Tryb testowy - jednorazowa synchronizacja");
  await performDataSync();
  process.exit(0);
}

// Sprawdź argumenty uruchomienia (tylko gdy plik jest uruchamiany bezpośrednio)
if (require.main === module) {
  const args = process.argv.slice(2);
  const isOnceMode = args.includes("--once") || args.includes("-o");

  if (isOnceMode) {
    runOnceSync();
  } else {
    startScheduler();
  }
}

module.exports = {
  performDataSync,
  startScheduler,
  runOnceSync,
  isSyncRunning,
  getLastSyncTime,
};
