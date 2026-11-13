# Changelog

Alle Änderungen am Plugin werden pro Version dokumentiert. Format: Added, Changed, Fixed. Versionierung: SemVer. Aufgabeninhalte werden hier nicht protokolliert.

## [Unreleased]

## [0.8.0] - 2026-11-13

### Added
- Option „Wiederholen“ direkt im Aufgabeneditor: täglich, wöchentlich oder monatlich, Intervall 1–365, erster Termin, optionale Uhrzeit, Dauer und Enddatum.
- Automatische eigenständige Markdown-Aufgaben mit Planungsdatum und Fälligkeit für jede Wiederholung; dadurch erscheinen sie als flexible Einträge oder Zeitblöcke im Kalender.
- Rollendes Erstellungsfenster: 90 Tage im Voraus und bis zu 30 Tage rückwirkend beim Öffnen bzw. minütlichen Scan.
- Kennzeichnung von Serien und Einzelterminen auf den Karten und im Kalender; pausierbare Serie über „Keine Wiederholung“ in der ursprünglichen Aufgabe.

### Changed
- Serien laufen unabhängig vom Abschluss des ersten oder vorherigen Termins. Neue Termine starten offen und mit zurückgesetzten Teilaufgaben, übernehmen aber Notizen, Tags und Priorität.
- Stabile Termin-IDs verhindern doppelte Erzeugung bei erneutem Scan, parallelen Scans, Neustart oder umbenannten Terminen.
- Monatliche Termine am Monatsende werden auf den letzten Monatstag begrenzt, ohne den ursprünglichen Tag für spätere Monate zu verlieren. Uhrzeiten bleiben lokale Uhrzeiten über Zeitumstellungen hinweg.
- Serienänderungen gelten für noch nicht erstellte Termine. Vorhandene Einzeltermine werden nicht überschrieben oder beim Pausieren gelöscht.

## [0.7.0] - 2026-11-13

### Added
- Offene Aufgaben und Aufgaben in Arbeit mit Fälligkeit erscheinen automatisch am Fälligkeitstag unter „Flexibel“ im Kalender, markiert mit „Fällig“.
- Wochenzähler und Tageszusammenfassung berücksichtigen automatische Kalendereinträge.

### Changed
- Explizite Tagesplanung hat Vorrang; keine doppelten Kalenderblöcke. Undatierte Aufgaben werden nicht automatisch eingeplant. Überfällige Aufgaben bleiben am ursprünglichen Termin.
- Automatische Anzeige verändert keine Aufgabendateien. Bearbeiten öffnet die Originalaufgabe; Ziehen erstellt eine explizite Planung und bewahrt die Deadline.
- Direkt im Kalender erledigte automatische Einträge behalten ihren angezeigten Tag als Tagesplanung und bleiben sichtbar. Archivierte sowie ungeplante verzögerte/erledigte Aufgaben werden nicht automatisch aufgenommen.

## [0.6.0] - 2026-11-13

### Added
- Reiter „Kalender“ im Tagesplaner mit Wochen- und Tagesansicht.
- Interaktive Todo-Blöcke: Titel zum Bearbeiten anklicken, Kreis zum Erledigen oder Wiederöffnen.
- Freie halbstündige Kalenderfelder öffnen den Aufgabeneditor mit Datum und Uhrzeit.
- Blöcke direkt auf eine andere Uhrzeit oder einen anderen Tag ziehen; Ablage wird auf 15 Minuten gerundet.
- Flexible Aufgaben ohne Startzeit oberhalb des Zeitrasters; Ziehen zwischen flexiblem Bereich und Zeitraster möglich.
- Überlappende Blöcke werden nebeneinander angeordnet und nicht übereinander verdeckt.
- Kalendernavigation zwischen Wochen bzw. Tagen und erweiterter Zeitbereich für frühe/späte Aufgaben.

### Changed
- Kalender verwendet die vorhandenen Planungsfelder; Fälligkeit, Notizen, Teilaufgaben und Status bleiben beim Verschieben erhalten.
- Keine externen Kalenderbibliotheken und keine Übertragung von Aufgaben.

## [0.5.1] - 2026-11-13

### Changed
- Deutlich breitere Aufgabenkarten: regulär zwei Statusspalten; vier nur bei mindestens 1640 px nutzbarer Boardbreite, eine unter 780 px.
- Mehr Innenabstand, größere Kartentitel, größere Notizfelder und besser lesbare Bedienelemente.
- Neutrale graue Kartenflächen, passend zum Obsidian-Hintergrund, mit helleren grauen Akzenten für Tags und Kartenaktionen.
- Prioritätsrand, Statuspunkt und Fälligkeit behalten ihre dezenten Signalfarben.
- Tagesplaner und flexible Tagesaufgaben passen die Kartenbreite ebenfalls an ihre nutzbare Fläche an.

## [0.5.0] - 2026-11-13

### Added
- Notiz als direkt sichtbares, mehrzeiliges Textfeld unter der Terminanzeige jeder Aufgabenkarte, auch im Tagesplaner.
- Notizen direkt auf der Karte speichern oder verwerfen; Cmd/Ctrl+Enter speichert ebenfalls.
- Ungespeicherte Entwürfe bleiben bei Statuswechseln und Aktualisierungen derselben Ansicht erhalten.

### Fixed
- Inline-Notizänderungen erhalten den aktuellen Stand der Teilaufgaben und unbekannte Metadaten.
- Zwischenzeitlich geänderte Notizen werden nicht überschrieben; der eigene Entwurf bleibt im Textfeld.

## [0.4.0] - 2026-11-13

### Added
- Neu gestalteter Aufgabeneditor mit klaren Bereichen für Titel, Details, optionale Tagesplanung, Notizen und Teilaufgaben.
- Teilaufgaben als einzelne Eingabezeilen mit Checkbox, Entfernen-Button und „+ Teilaufgabe“. Enter fügt die nächste Zeile ein.
- Sichtbarer Aufklapp-Button auf jeder Karte mit Teilaufgaben, Fortschrittsanzeige und zugänglichem Ein-/Ausklappzustand.
- Tagesplaner mit Tagesauswahl, Wochenübersicht und drei Ansichten: Tagesablauf, Status und Prioritäten.
- Optionales Planungsdatum, Startzeit und Dauer; Zeitüberschneidungen aktiver Aufgaben werden markiert.
- Bestehende Aufgaben einplanen, auf einen anderen Tag verschieben oder aus dem Plan nehmen; die Deadline bleibt erhalten.
- Befehl „Tagesplaner öffnen“ und direkte Erstellung einer Tagesaufgabe für den gewählten Tag.

### Changed
- Notizen und Teilaufgaben werden im Editor getrennt bearbeitet, bleiben aber gemeinsam in der Markdown-Datei gespeichert.
- Vorhandene Checkbox-Positionen, Einrückungen und Zeilenumbrüche bleiben bei unveränderten Notizen erhalten.

### Fixed
- Leere Teilaufgaben und ungültige Zeitblöcke werden vor dem Speichern verständlich im Formular angezeigt.
- Browser-Normalisierung von CRLF-Zeilenumbrüchen verschiebt bestehende Checklisten nicht.

## [0.3.0] - 2026-11-12

### Changed
- TaskFlow übernimmt Hintergrund, Text- und Rahmenfarben des aktuellen Obsidian-Themes.
- Eigene Fenster-Kopfzeile und feste Maximalbreite entfernt: Board und Analyse nutzen die gesamte Blattbreite.
- Größere, natürliche Typografie und luftigere Karten; neutrale Überschriften auch mit Zen.
- Teilaufgaben aufklappbar; der aufgeklappte Zustand bleibt bei Aktualisierungen erhalten.
- Statistik vollständig neu gestaltet: Kennzahlen, Status-Ringdiagramm, Abschlussverlauf, Fälligkeiten, Prioritäten und Tag-Balken.

### Added
- Abschlusszeitraum wählbar: 7, 14, 30 oder 90 Kalendertage inklusive heute.
- 90-Tage-Verlauf mit Sieben-Tage-Abschnitten ohne verlorene Resttage.
- Exakte Abschlusswerte zusätzlich als aufklappbare Tabelle und beschriftete Diagramme für Screenreader.
- Klare Leerzustände und Hinweis auf erledigte Aufgaben ohne Abschlussdatum.

### Fixed
- Theme-Styles machen TaskFlow-Buttons nicht mehr unbeabsichtigt pillenförmig oder Überschriften rot/gelb.
- Statistik trennt aktuellen Aufgabenstand vom ausgewählten Abschlusszeitraum.
- Fehlendes Abschlussdatum wird nicht als Datum im Jahr 1970 interpretiert.

## [0.2.0] - 2026-11-12

### Added
- Arbeitszentrale mit Seitenleiste, Tag-Navigation und einem aus echten Fälligkeiten abgeleiteten Tagesfokus.
- Paper-Studio-Gestaltung in Puderblau und Apricot, passend für helles und dunkles Obsidian.
- Dezente Farbmarker: Kartenrand für Priorität, Punkt und Text für Status, Terminlabel für Fälligkeit.
- Sanftes Gleiten beim Statuswechsel per Drag & Drop oder Statusauswahl (430 ms); respektiert reduzierte Bewegung.
- Sichtbare Ablagefläche beim Ziehen, Tastaturbedienung über die vorhandene Statusauswahl und Statusansagen.
- Neue Aufgaben lassen sich direkt in der gewünschten Spalte anlegen.

### Changed
- Statistik, Suche, Archiv und Aufgabeneditor an die neue Gestaltung angepasst.
- Kanban passt sich der tatsächlichen Breite des Obsidian-Panels an.

### Fixed
- Unveränderte Vault-Scans zeichnen die Ansicht nicht mehr neu; laufende Animationen und Eingaben bleiben erhalten.
- Abschlüsse werden in der Statistik dem lokalen Kalendertag zugeordnet.
- Fehlgeschlagene Status- oder Teilaufgabenänderungen setzen deaktivierte Bedienelemente zurück.

## [0.1.0] - 2026-11-12

### Added
- Kanban mit Offen, In Arbeit, Verzögert und Erledigt; Drag & Drop und zugängliche Statusauswahl.
- Dashboard mit Gesamtzahlen und separater Überfälligkeitsanzeige.
- Suche und Tagfilter; Fälligkeit und Priorität.
- Markdown-Notizen, Wiki-Links und interaktive Teilaufgaben.
- Statistik: Abschlussquote, 14 Tage Abschlüsse und Verteilung nach Tags.
- Archiv mit Wiederherstellung; Aufgaben bleiben als Markdown erhalten.
- Ein Markdown-Dokument pro Aufgabe mit stabiler UUID.
- Konfliktschutz beim Speichern und automatische Aktualisierung nach Vault-Änderungen.
- Automatisierte Prüfungen und GitHub-Releases mit BRAT-Installationsdateien.
