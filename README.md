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
- Notizen sind Markdown. Mit **Teilaufgabe hinzufügen** eine Checkbox ergänzen; alternativ `- [ ] Text` schreiben.
- Karten durch Ziehen oder mit der Statusauswahl verschieben. Kartentitel öffnet den Editor, **Notiz öffnen** das Markdown-Dokument mit Obsidian-Vorschau und Wiki-Links.
- **Verzögert** setzt du selbst, z. B. bei einer Blockade. **Überfällig** bedeutet: Fälligkeit vor dem heutigen lokalen Datum und noch nicht erledigt. Das ist eine zusätzliche Markierung und verschiebt keine Karten.
- Suche durchsucht Titel, Notiz und Tags. Tagfilter und Suche gelten auch für die Statistik. Die Zahlen oben zeigen alle aktiven bzw. archivierten Aufgaben.
- Statistik zeigt den aktuellen Stand und Aufgaben, die in den letzten 14 Tagen erledigt wurden. Wieder geöffnete Aufgaben verlieren das Abschlussdatum; erneutes Erledigen setzt es neu. Es ist keine Ereignishistorie aller Statuswechsel.
- Archivieren blendet Aufgaben aus dem aktiven Board aus. Im **Archiv** ansehen und wiederherstellen. Es wird nichts gelöscht.


## Gestaltung und Bewegungen ab 0.2.0

Die Arbeitszentrale verwendet **Paper Studio in Puderblau & Apricot** mit Unterstützung für helles und dunkles Obsidian. Die Seitenleiste enthält Board, Statistik, Archiv und die tatsächlich vorhandenen Tags. „Heute im Fokus“ zeigt die ersten beiden heute fälligen aktiven Aufgaben; es sind keine künstlichen Beispieldaten hinterlegt.

Farben bleiben unabhängig erkennbar:

- **Priorität:** schmaler Kartenrand, mit Text und Pfeil auf der Karte. Hoch: Altrosé; Normal: Apricot; Niedrig: Puderblau.
- **Status:** Punkt und Text. Offen: Blau; In Arbeit: Flieder; Verzögert: Apricot; Erledigt: Salbei.
- **Fälligkeit:** Terminlabel. Überfällig: Altrosé; Heute: Apricot; später: Blau; kein Termin und abgeschlossene Aufgaben: neutral. Erledigte Aufgaben zeigen keine Überfälligkeitswarnung.

Beim Statuswechsel gleitet die Karte in etwa 430 ms mit einem dezenten Anheben in die Zielspalte. Das gilt für Drag & Drop und die Statusauswahl, wenn die Karte vor und nach dem Wechsel sichtbar ist. Bei aktivierter Betriebssystemoption „Bewegung reduzieren“ wird ohne Animation gewechselt. Auf Touch-Geräten oder mit der Tastatur steht immer die Statusauswahl zur Verfügung; Drag & Drop hängt vom Host ab.

Die Gestaltung passt sich der Breite des Obsidian-Panels an: vier, zwei oder eine Spalte. Das Datenformat bleibt unverändert; es ist keine Migration nötig.

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
