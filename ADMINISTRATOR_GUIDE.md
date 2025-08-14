# Instrukcja korzystania z BitmaturaBot

## 🚀 Pierwsze uruchomienie

1. **Konfiguracja bota:** Użyj komendy `/konfiguracja`
2. **Podaj liczbę grup** (np. 3)
3. **Przypisz role** do każdej grupy (pinguj @rolę)
4. **Przypisz rolę ucznia** (pinguj @rolę dla wszystkich uczniów)
5. **Import użytkowników** (opcjonalnie)

## 📁 Import użytkowników z pliku

Po skonfigurowaniu ról bot zapyta czy chcesz zaimportować użytkowników:

### Format pliku .txt:

```
<imię i nazwisko>;<email>;<numer grupy>
```

### Przykład pliku:

```
Jan Kowalski;jan.kowalski@example.com;1
Anna Nowak;anna.nowak@example.com;2
Piotr Wiśniewski;piotr.wisniewski@example.com;1
Maria Dąbrowska;maria.dabrowska@example.com;3
```

### Ważne zasady:

- ✅ Każda osoba w **osobnej linii**
- ✅ Elementy oddzielone **średnikami** (`;`)
- ✅ Email musi być **prawidłowy** (zawierać @)
- ✅ Numer grupy musi być **liczbą** większą od 0
- ✅ Plik musi mieć rozszerzenie **.txt**

### Co się dzieje podczas importu:

- 📊 Bot przetwarza każdą linię pliku
- ✅ Dodaje nowych użytkowników do bazy
- 🔄 Aktualizuje dane istniejących użytkowników
- ⚠️ Raportuje błędy w nieprawidłowych liniach
- 📈 Pokazuje statystyki importu

## 👥 Rejestracja użytkowników

1. **Nowy członek** dołącza na serwer
2. **Bot wysyła powitanie** z instrukcjami
3. **Użytkownik** wpisuje `/rejestruj`
4. **Bot tworzy prywatny wątek**
5. **Użytkownik podaje email**
6. **Bot sprawdza bazę** i przypisuje role
7. **Automatyczne nadanie ról** na podstawie grupy

## ⚙️ Komendy

- `/ping` - Test działania bota
- `/rejestruj` - Rozpocznij rejestrację
- `/konfiguracja` - Konfiguracja serwera (tylko właściciel)

## 🗄️ Baza danych

Bot przechowuje:

- **Użytkownicy:** email, imię i nazwisko, numer grupy
- **Konfiguracja serwera:** role grup, rola ucznia
- **Cache:** szybki dostęp do danych

## 🔧 Rozwiązywanie problemów

**Problem:** Import nie działa

- ✅ Sprawdź format pliku
- ✅ Upewnij się, że plik ma rozszerzenie .txt
- ✅ Sprawdź czy emaile są prawidłowe

**Problem:** Role się nie przypisują

- ✅ Sprawdź czy bot ma uprawnienia do zarządzania rolami
- ✅ Upewnij się, że rola bota jest wyżej niż role użytkowników
- ✅ Sprawdź konfigurację przez `/konfiguracja`

**Problem:** Baza danych nie działa

- ✅ Sprawdź połączenie internetowe
- ✅ Sprawdź dane w pliku .env
