# Dokumentacja komendy `/zapytaj`

## Opis

Komenda `/zapytaj` pozwala na zadawanie anonimowych pytań nauczycielom i administratorom. Pytania są wysyłane publicznie na kanał, ale bez ujawniania tożsamości osoby pytającej.

## Składnia

```
/zapytaj osoba:@Nauczyciel pytanie:"Treść pytania"
```

## Parametry

- **`osoba`** (wymagany) - Nauczyciel lub administrator do którego kierujesz pytanie
- **`pytanie`** (wymagany) - Treść pytania (maksymalnie 1000 znaków)

## Uprawnienia

**Dostęp:** Uczniowie, nauczyciele i administratorzy  
**Ograniczenia:**

- Osoba docelowa musi mieć rolę nauczyciela lub administratora
- Nie można zadać pytania samemu sobie

## Jak to działa

1. **Użytkownik wywołuje komendę** z wybraną osobą i pytaniem
2. **Bot sprawdza uprawnienia** osoby docelowej (czy to nauczyciel/admin)
3. **Bot wysyła nową wiadomość** na kanał z pingiem i prostym embedem pytania
4. **Bot wysyła DM do odbiorcy** z powiadomieniem i linkiem do pytania
5. **Pytający dostaje prywatne potwierdzenie** (tylko dla niego widoczne)

**Ważne:** Bot wysyła pytanie jako swoją własną wiadomość, nie jako odpowiedź na komendę, dzięki czemu **tożsamość pytającego pozostaje całkowicie ukryta**.

## Przykład użycia

```
/zapytaj osoba:@Pani_Kowalska pytanie:"Czy będzie sprawdzian z matematyki w przyszłym tygodniu?"
```

**Wynik na kanale:**

```
@Pani_Kowalska

[EMBED od bota: Anonimowe pytanie]
Czy będzie sprawdzian z matematyki w przyszłym tygodniu?

Pytanie zostało zadane anonimowo
```

**DM do odbiorcy (@Pani_Kowalska):**

```
[EMBED: Otrzymałeś anonimowe pytanie]
Ktoś zadał Ci pytanie na kanale #ogólny

Pytanie: Czy będzie sprawdzian z matematyki w przyszłym tygodniu?
🔗 Link do wiadomości: [Kliknij tutaj aby przejść do pytania](link)

Pytanie jest anonimowe - nie wiesz kto je zadał
```

**Prywatna wiadomość do pytającego:**

```
✅ Twoje anonimowe pytanie zostało przekazane do @Pani_Kowalska.
(tylko pytający to widzi)
```

**Uwaga:** Na kanale nie ma żadnej informacji o tym, kto zadał pytanie. Bot wysyła wiadomość jako swoją własną, nie jako odpowiedź na komendę użytkownika. Dodatkowo odbiorca dostaje powiadomienie DM z bezpośrednim linkiem do pytania.

## Funkcje bezpieczeństwa

### ✅ **Weryfikacje:**

- Sprawdzenie czy osoba docelowa jest na serwerze
- Kontrola ról (tylko nauczyciele/admini)
- Blokada pytań do samego siebie
- Sprawdzenie uprawnień pytającego

### 🔒 **Anonimowość:**

- **Całkowita anonimowość** - bot wysyła pytanie jako swoją własną wiadomość
- **Brak śladu komendy** - na kanale nie widać kto wywołał `/zapytaj`
- Tylko prywatne potwierdzenie dla pytającego
- Niemożliwość identyfikacji przez interfejs Discorda

### ❌ **Komunikaty błędów:**

- _"Ta osoba nie jest członkiem tego serwera"_
- _"Możesz zadawać pytania tylko nauczycielom lub administratorom"_
- _"Nie możesz zadać pytania samemu sobie"_
- _"Brak dostępu: [powód]"_

## Przypadki użycia

### 📚 **Dla uczniów:**

- Zadawanie pytań o materiał bez krępowania się
- Pytania o sprawdziany i terminy
- Prośby o wyjaśnienia zagadnień
- Zgłaszanie problemów technicznych

### 👨‍🏫 **Dla nauczycieli:**

- Otrzymywanie szczerych opinii od uczniów
- **Powiadomienia DM** z bezpośrednim linkiem do pytania
- Pytania między nauczycielami (też anonimowo)
- **Szybki dostęp** do pytań przez klikalny link
- Identyfikacja problemów w nauczaniu

## Ograniczenia

- **Maksymalnie 1000 znaków** w pytaniu
- **Tylko nauczyciele/admini** jako odbiorcy
- **Brak edycji** wysłanych pytań
- **Brak historii** pytań w bocie
- **Publiczne wyświetlanie** na kanale (ale anonimowe)
- **DM może się nie udać** jeśli odbiorca ma zablokowane wiadomości prywatne

## Wskazówki

### 💡 **Dla pytających:**

- Formułuj pytania jasno i konkretnie
- Pamiętaj że pytanie będzie widoczne dla wszystkich
- Wybieraj odpowiednią osobę do pytania
- Unikaj pytań osobistych/prywatnych

### 👨‍🏫 **Dla nauczycieli:**

- **Sprawdzaj DM** - otrzymasz powiadomienie o każdym pytaniu
- **Kliknij link w DM** aby szybko przejść do pytania na kanale
- Odpowiadaj na kanale lub DM do całej klasy
- Zachęcaj do korzystania z funkcji
- Pamiętaj że nie wiesz kto pyta (chyba że się ujawnią)
- **Włącz DM** jeśli chcesz otrzymywać powiadomienia

## Bezpieczeństwo i moderacja

- **Pytania są anonimowe** ale moderatorzy mogą sprawdzić logi bota
- **Nadużycia można zgłaszać** do administracji
- **Treści nieodpowiednie** podlegają regulaminom serwera
- **Bot loguje** aktywność do celów technicznych
