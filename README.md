# TaskFlow Kanban für Obsidian

Ein lokales Aufgabenboard mit Dashboard, Statistik, Tags, Fälligkeit, Priorität, Notizen und Teilaufgaben. Oberfläche auf Deutsch. Aufgaben sind normale Markdown-Dateien in `TaskFlow/Aufgaben`. Keine Anmeldung, kein eigener Server, keine Telemetrie.

## Installation über BRAT

1. In deinem Vault unter **Einstellungen → Community Plugins** BRAT installieren und aktivieren.
2. BRAT-Einstellungen öffnen → **Add Beta plugin**.
3. `https://github.com/NoanP/obsidian-taskflow` eintragen, die neueste Version wählen und hinzufügen. Voraussetzung: Unter Releases muss eine veröffentlichte Version mit `main.js`, `manifest.json` und `styles.css` vorhanden sein.
4. **TaskFlow Kanban** unter Community Plugins aktivieren, falls BRAT das nicht bereits erledigt.
5. Über das Kanban-Symbol links oder die Befehlspalette **TaskFlow Kanban: Dashboard öffnen** starten.

Für Updates in BRAT die automatische Prüfung aktivieren oder **Check for updates** ausführen. Auf dem Smartphone BRAT und dieses Plugin separat im synchronisierten Vault installieren. Die mobile Oberfläche ist vorbereitet, aber noch nicht auf einem echten Mobilgerät getestet.

## Benutzung

- **Neue Aufgabe:** Titel, Status, Tags mit Kommas, Fälligkeit und Priorität eintragen.
- Notizen sind Markdown. Mit **+ Teilaufgabe** eine eigene Eingabezeile ergänzen; Enter fügt die nächste Zeile hinzu. Alternativ sind Markdown-Checkboxen `- [ ] Text` in der Datei weiterhin möglich.
- Karten durch Ziehen oder mit der Statusauswahl verschieben. Kartentitel öffnet den neuen Editor. **Teilaufgaben · x/y** klappt die Checkliste direkt auf der Karte auf und zu; **Notiz öffnen** das Markdown-Dokument mit Obsidian-Vorschau und Wiki-Links.
- **Verzögert** setzt du selbst, z. B. bei einer Blockade. **Überfällig** bedeutet: Fälligkeit vor dem heutigen lokalen Datum und noch nicht erledigt. Das ist eine zusätzliche Markierung und verschiebt keine Karten.
- Suche durchsucht Titel, Notiz und Tags. Tagfilter und Suche gelten auch für die Statistik. Die Zahlen oben zeigen alle aktiven bzw. archivierten Aufgaben.
- Statistik zeigt den aktuellen Stand und Aufgaben, die in den letzten 14 Tagen erledigt wurden. Wieder geöffnete Aufgaben verlieren das Abschlussdatum; erneutes Erledigen setzt es neu. Es ist keine Ereignishistorie aller Statuswechsel.
- Archivieren blendet Aufgaben aus dem aktiven Board aus. Im **Archiv** ansehen und wiederherstellen. Es wird nichts gelöscht.


## Gestaltung und Bewegungen ab 0.2.0

Die Arbeitszentrale übernimmt ab 0.3.0 die nativen Hintergrund-, Text- und Rahmenfarben deines Obsidian-Themes. **Puderblau & Apricot** bleiben als dezente Akzente erhalten. Die feste Maximalbreite und die separate Fenster-Kopfzeile entfallen. Die Seitenleiste enthält Board, Statistik, Archiv und die tatsächlich vorhandenen Tags. „Heute im Fokus“ zeigt die ersten beiden heute fälligen aktiven Aufgaben; es sind keine künstlichen Beispieldaten hinterlegt.

Farben bleiben unabhängig erkennbar:

- **Priorität:** schmaler Kartenrand, mit Text und Pfeil auf der Karte. Hoch: Altrosé; Normal: Apricot; Niedrig: Puderblau.
- **Status:** Punkt und Text. Offen: Blau; In Arbeit: Flieder; Verzögert: Apricot; Erledigt: Salbei.
- **Fälligkeit:** Terminlabel. Überfällig: Altrosé; Heute: Apricot; später: Blau; kein Termin und abgeschlossene Aufgaben: neutral. Erledigte Aufgaben zeigen keine Überfälligkeitswarnung.

Beim Statuswechsel gleitet die Karte in etwa 430 ms mit einem dezenten Anheben in die Zielspalte. Das gilt für Drag & Drop und die Statusauswahl, wenn die Karte vor und nach dem Wechsel sichtbar ist. Bei aktivierter Betriebssystemoption „Bewegung reduzieren“ wird ohne Animation gewechselt. Auf Touch-Geräten oder mit der Tastatur steht immer die Statusauswahl zur Verfügung; Drag & Drop hängt vom Host ab.

Die Gestaltung passt sich der Breite des Obsidian-Panels an: vier, zwei oder eine Spalte. Das Datenformat bleibt unverändert; es ist keine Migration nötig.

## Analyse und Diagramme ab 0.3.0

Die neue Statistik zeigt:

- **Kennzahlen:** aktive Aufgaben, erledigte Aufgaben im gewählten Zeitraum, aktuell überfällige Aufgaben und Abschlussquote aller ausgewählten Aufgaben.
- **Abschlussverlauf:** Säulendiagramm für 7/14/30/90 Kalendertage einschließlich heute. Bei 90 Tagen werden je sieben Tage zusammengefasst; die letzte Teilwoche bleibt enthalten. Die genauen Werte stehen zusätzlich unter „Werte als Tabelle“.
- **Aufgabenstatus:** Ringdiagramm mit Anzahl und Anteil je Status.
- **Fälligkeiten:** aktive Aufgaben, aufgeteilt in überfällig, heute, nächste sieben Tage ab morgen, später und ohne Termin.
- **Prioritäten:** Verteilung der aktiven Aufgaben.
- **Tags:** gestapelte Balken für erledigte und aktive Aufgaben. Die gemeinsame Skala zeigt die Anzahl; mehrfach getaggte Aufgaben zählen pro zugehörigem Tag.

Suche und Tagfilter gelten für alle Kennzahlen und Diagramme. Der Zeitraum bezieht sich auf den **Abschlussverlauf** und die Kennzahl „Erledigt im Zeitraum“; Status, Prioritäten und Fälligkeiten zeigen den aktuellen Stand. Erledigte Aufgaben ohne gültiges Abschlussdatum werden im Status mitgezählt, aber nicht zeitlich zugeordnet. Es wird weiterhin nur das letzte Abschlussdatum ausgewertet, keine vollständige Ereignishistorie.

Die Diagramme benötigen keine externen Bibliotheken und übertragen keine Aufgaben. Helles und dunkles Zen-Theme sowie ein schmales Panel wurden in einer lokalen Vorschau mit Beispieldaten geprüft. Der native Obsidian-Abschlusstest erfolgt nach dem BRAT-Update; die Vorschau simuliert die Host-API.

## Breitere graue Karten ab 0.5.1

Die Karten nutzen neutrale, aus den Obsidian-Themefarben abgeleitete Grautöne. Tags und Bedienelemente auf den Karten erhalten hellere graue Akzente. Statuspunkt, Prioritätsrand und Fälligkeit bleiben farblich unterscheidbar; der Blatt-Hintergrund folgt weiterhin Obsidian.

Die Statusspalten sind regulär in zwei breiten Spalten angeordnet. Erst ab 1640 Pixeln nutzbarer Boardbreite stehen alle vier nebeneinander; unter 780 Pixeln wird eine Spalte verwendet. Damit stehen die Karten in kleineren Fenstern nicht mehr zusammengedrängt nebeneinander. Im Tagesplaner gelten die Breiten seiner Inhaltsfläche. Titel, Innenabstände und Notizfelder sind größer. Die Abmessungen beziehen sich auf CSS-Pixel, nicht auf die Bildschirmauflösung.

Helles und dunkles Zen-Theme sowie verschiedene Fensterbreiten wurden lokal mit Beispieldaten geprüft. Es gibt keine Änderungen am Datenformat.

## Notiz direkt auf der Karte ab 0.5.0

Unter der Terminanzeige steht auf jeder Karte ein mehrzeiliges **Notiz**-Textfeld. Das gilt auch für die Karten im Tagesplaner. Vorhandene Notizen werden angezeigt; leere Felder zeigen „Notiz zur Aufgabe …“.

Nach dem Bearbeiten erscheinen **Speichern** und **Verwerfen**. Cmd/Ctrl+Enter speichert ebenfalls. Es gibt keine automatische Speicherung beim Tippen. Ungespeicherte Entwürfe bleiben bei Aktualisierungen, Statuswechseln und Wechseln zwischen Board und Tagesplaner innerhalb derselben geöffneten TaskFlow-Ansicht erhalten. Vor dem Schließen oder Neuladen der Ansicht bitte speichern.

Teilaufgaben werden separat behandelt und nicht im Notizfeld angezeigt. Beim Speichern bleiben der aktuelle Checkbox-Stand und alle anderen Aufgabenfelder erhalten. Wenn die Notiz zwischenzeitlich anderswo bearbeitet wurde, wird das Speichern abgebrochen und der eigene Entwurf bleibt im Textfeld. Eine führende Standardüberschrift „## Notizen“ wird nur für die Anzeige ausgeblendet; Markdown und Links können weiterhin als Text bearbeitet werden.

## Aufgabeneditor und Teilaufgaben ab 0.4.0

Der Editor trennt Titel, Status, Priorität, Fälligkeit, Tags, optionale Tagesplanung, Notizen und Teilaufgaben. Teilaufgaben brauchen keinen Markdown-Code: **+ Teilaufgabe** fügt eine Zeile hinzu, Enter die nächste. Jede Zeile hat Checkbox und Entfernen-Button. Leere Zeilen müssen vor dem Speichern ausgefüllt oder entfernt werden. Mit Cmd/Ctrl+Enter wird gespeichert.

Auf der Karte zeigt ein eigener Button **▸ Teilaufgaben · 1/3** den Fortschritt. Ein Klick blendet die Checkliste ein; ein weiterer aus. Der aufgeklappte Zustand bleibt bei Aktualisierungen derselben Ansicht erhalten. Die Checkboxen lassen sich direkt abhaken. Alle Teilaufgaben bleiben im Markdown-Text der Aufgabe gespeichert. Bei Änderungen ausschließlich an Teilaufgaben bleiben Position, Einrückung und Zeilenumbrüche vorhandener Checklisten erhalten. Wenn die Notizen selbst geändert werden, wird die separat bearbeitete Checkliste unterhalb der neuen Notizen zusammengeführt.

## Tagesplaner ab 0.4.0

Über die Seitenleiste **Tagesplaner** oder die Befehlspalette **TaskFlow Kanban: Tagesplaner öffnen** aufrufen.

- Oben den Planungstag auswählen oder mit Heute und den Pfeilen navigieren. Die Wochenübersicht zeigt Montag bis Sonntag mit der Anzahl eingeplanter Aufgaben. Suche und Tagfilter gelten auch hier.
- **+ Tagesaufgabe** öffnet den Editor mit dem ausgewählten Planungsdatum. Unter „Tagesplanung · optional“ können Startzeit und geschätzte Dauer ergänzt werden.
- **Aufgaben einplanen** zeigt weitere aktive Aufgaben. Einplanen ordnet sie dem ausgewählten Tag zu. Eine bereits an einem anderen Tag geplante Aufgabe wird auf den gewählten Tag verschoben, einschließlich einer vorhandenen Uhrzeit.
- **Tagesablauf** sortiert Zeitblöcke nach Startzeit und zeigt flexible Aufgaben ohne Uhrzeit separat. **Status** und **Prioritäten** gruppieren die Aufgaben des ausgewählten Tages als Kanban. Bestehende Statusauswahl und Drag & Drop bleiben nutzbar; in der Prioritätsansicht ändert Drag & Drop die Priorität.
- **Zeit & Planung** öffnet die Aufgabe zum Bearbeiten. **Aus Tagesplan nehmen** entfernt Planungsdatum und Uhrzeit, aber weder die Aufgabe noch ihre Deadline.
- Zeitüberschneidungen aktiver Aufgaben werden markiert. Zeitblöcke müssen innerhalb eines Tages liegen; gültige Dauern sind 5–720 Minuten. Ohne hinterlegte Dauer werden 30 Minuten geschätzt.

Planung und Deadline sind getrennt: `scheduled` ist das lokale Planungsdatum (YYYY-MM-DD), `scheduledTime` die optionale Startzeit (HH:MM), `durationMinutes` die geschätzte Dauer. `due` bleibt die Fälligkeit. Die Felder sind optional; vorhandene Aufgaben bleiben ohne Migration nutzbar. Es gibt keine automatische Archivierung, keine Erinnerungsbenachrichtigungen, keine Vorlagenverwaltung und keine Kalender-Synchronisation in dieser Version.

Editor, Teilaufgaben und Tagesplaner wurden mit Beispieldaten in einer lokalen Vorschau einschließlich Zen-Theme bedient und geprüft. Die Vorschau simuliert die Obsidian-Host-API; den nativen Abschlusstest nach dem BRAT-Update bitte im Vault durchführen.

## Obsidian-Integration und Daten

Die erste neue Aufgabe erzeugt `TaskFlow/Aufgaben/<UUID>.md`. Die Frontmatter-Felder sind `taskflow: 1`, `id`, `title`, `status` (`open`, `progress`, `delayed`, `done`), `priority`, `tags`, `due`, `created`, `updated`, optional `completed` und `archived`. Freie Notizen und Teilaufgaben stehen darunter. Dateinamen bleiben bei Titeländerungen stabil; verlinke über Obsidian-Aliasse nach Bedarf.

Bestehende Tasks-, TaskNotes- oder beliebige Markdown-Checkboxen werden **nicht automatisch importiert**. Das Dashboard umfasst alle TaskFlow-Aufgaben. Andere Plugins bleiben unabhängig nutzbar. Anlegen, Bearbeiten und Statuswechsel funktionieren ohne diese Plugins.

Obsidian Sync/OneDrive synchronisiert die Markdown-Dateien wie andere Vault-Notizen. TaskFlow erkennt Änderungen und verhindert das Überschreiben eines zwischenzeitlich bearbeiteten Dokuments durch einen alten Editor. Das ersetzt keine Backups und löst keine Konflikte zwischen Offline-Geräten. Bei einer Konfliktmeldung zuerst die eigene Eingabe sichern, dann die Aufgabe neu öffnen.

Termine markieren Fälligkeit; es gibt noch keine Betriebssystem-Benachrichtigungen, Wiederholungen oder Kalender-Synchronisation. Eingebettete Dashboards und Migration vorhandener Aufgaben sind mögliche spätere Erweiterungen.

## Weiterentwicklung und Releases

Der Quellcode liegt direkt in `main.js` (CommonJS mit Obsidian als Host-Abhängigkeit). Es gibt keinen Build-Schritt und keine Laufzeit-Abhängigkeiten. Zur Entwicklung Node.js 22+ verwenden:

```sh
git clone https://github.com/NoanP/obsidian-taskflow.git
cd obsidian-taskflow
npm run check
npm test
```

Nach Änderungen:

1. Auf einem Branch entwickeln und prüfen. Obsidian-Funktionstest in einem Test-Vault durchführen.
2. In `CHANGELOG.md` unter `Unreleased` sammeln und für die Veröffentlichung einen Abschnitt `## [0.1.1] - YYYY-MM-DD` erstellen.
3. Version in `manifest.json` und `package.json` gleich erhöhen; `versions.json` um die neue Version und die minimale Obsidian-Version ergänzen.
4. Nach `main` zusammenführen. Der Workflow **Check and release** prüft Syntax, Tests und Versionen und erstellt ein Release mit exakt dieser Versionsnummer sowie allen drei BRAT-Dateien. Vorhandene Releases werden nicht überschrieben. Unter **Actions** den erfolgreichen Lauf kontrollieren.
5. BRAT findet das neue Release. Die Aufgaben im Vault bleiben bei Plugin-Updates erhalten.

Patch-Versionen für Fehlerkorrekturen, Minor für zusätzliche Funktionen, Major für inkompatible Änderungen. Änderungen am Datenformat brauchen eine explizite, getestete Migration mit Backup. Nie echte Vault-Daten oder `.obsidian` in dieses öffentliche Repository hochladen.

Später genügt z. B.: „Führe NoanP/obsidian-taskflow weiter, ergänze X, aktualisiere Changelog und veröffentliche die nächste Version.“ Das Repository enthält alle nötigen Grundlagen.

## Prüfung und Grenzen

Automatisierte Tests decken Statuszählung, Fälligkeit, Markdown-Erhaltung, Teilaufgaben, Abschlussdaten und konkurrierende Änderungen ab. Der YAML-Hostadapter ist in Unit-Tests durch JSON (YAML-Teilmenge) ersetzt. Die echte Obsidian-Integration zusätzlich im Vault prüfen. Dies ist eine frühe Version; mobile Nutzung und sehr große Aufgabenbestände sind noch nicht ausführlich erprobt.

## Referenzen

- [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)
- [BRAT und Installationshilfe](https://github.com/TfTHacker/obsidian42-brat)
- [BRAT Developer Guide](https://github.com/TfTHacker/obsidian42-brat/blob/main/BRAT-DEVELOPER-GUIDE.md)
