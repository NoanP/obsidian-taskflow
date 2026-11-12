# Changelog

Alle Änderungen am Plugin werden pro Version dokumentiert. Format: Added, Changed, Fixed. Versionierung: SemVer. Aufgabeninhalte werden hier nicht protokolliert.

## [Unreleased]

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
