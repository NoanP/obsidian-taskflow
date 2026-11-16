# Changelog

Alle Änderungen am Plugin werden pro Version dokumentiert. Format: Added, Changed, Fixed. Versionierung: SemVer. Aufgabeninhalte werden hier nicht protokolliert.

## [Unreleased]

## [0.14.5] - 2026-11-16

### Changed
- Freigegebene Startseite „Mein Tag“: heutige Aufgaben links, sechs interaktive Funktionskacheln rechts für Board, Kalender, Wiederholtermine, Statistik, Archiv und Papierkorb.
- Kompakte Tagesübersicht mit direktem Tagesplaner-Zugang; vorhandene Aufgaben können geöffnet, geplant und abgeschlossen werden.
- Überfälliges, nächste sieben Tage und Eingang bleiben unter „Weitere Aufgaben“ erreichbar. Bestehende Filterfavoriten bleiben nutzbar.
- Schnellzugriffe öffnen gezielt den richtigen Unterreiter und setzen alte Suchfilter zurück, damit keine Inhalte versehentlich verborgen bleiben.
- Neue Aufgaben werden ausschließlich im aktiven Board erfasst. Erstellen-Schaltflächen auf Startseite, im Tagesplaner, Kalender, Archiv und in der Statistik entfallen; auch leere Kalenderflächen legen keine neue Aufgabe mehr an.
- Der Tastaturbefehl „Neue Aufgabe im Board“ wechselt vor der Erfassung ins Board. Neue Serien bleiben unter Board → Wiederholtermine möglich.

### Compatibility
- Reine Änderung der Bedienung und Darstellung; Aufgaben, Serienregeln, Archiv und Papierkorb bleiben unverändert gespeichert. Kalenderblöcke sind weiterhin verschiebbar und bearbeitbar.

## [0.14.4] - 2026-11-16

### Changed
- Aufgaben werden beim Speichern mit Status „Erledigt“ sofort archiviert: über Board, Startseite, Kalender und Aufgabeneditor. Status, Abschlussdatum, Planung, Notizen und Teilaufgaben bleiben erhalten.
- Wechsel von „Erledigt“ zu einem offenen Status reaktiviert die Aufgabe. „Wiederherstellen“ im Archiv öffnet abgeschlossene Aufgaben wieder mit Status „Offen“.
- Die allgemeine Statistik berücksichtigt archivierte Abschlüsse weiterhin. Manuell archivierte offene Aufgaben und Papierkorbeinträge zählen dort nicht als aktive Aufgaben.
- Abgeschlossene Serientermine werden einzeln archiviert; die Wiederholungsregel und weitere Termine laufen unverändert weiter.

### Compatibility
- Keine nachträgliche Massenänderung vorhandener Dateien. Die Automatik greift beim nächsten Speichern einer Aufgabe mit erledigtem Status; der bisherige Papierkorb bleibt unverändert.

## [0.14.3] - 2026-11-16

### Added
- „Löschen“ im Aufgabeneditor verschiebt Einzelaufgaben und Serientermine zunächst in einen lokalen Papierkorb.
- Archiv-Unterreiter „Papierkorb“ mit Wiederherstellung und bestätigtem endgültigem Leeren. Ganze Serien werden kompakt als gemeinsam wiederherstellbare Gruppe angezeigt.
- Einzelne Folgetermine oder gesamte Serienabschnitte löschen. Der erste Serientermin enthält die Serienregel und wird zusammen mit der Serie gelöscht.

### Changed
- Gelöschte Aufgaben sind aus aktiven Ansichten, Kalender, Startseite, Serienverwaltung und Statistik ausgeschlossen; Status, Archivzustand, Notizen und Teilaufgaben bleiben bis zum endgültigen Löschen erhalten.
- Gelöschte Folgetermine werden über die vorhandene Ausnahmeliste vor Neuerzeugung geschützt; beim Wiederherstellen wird eine dafür ergänzte Ausnahme zurückgenommen. Gelöschte Serien erzeugen keine Folgetermine.
- Mehrdateiänderungen prüfen Dateistände und nehmen eigene Teiländerungen bei Fehlern zurück. Endgültiges Leeren betrifft nur die bestätigte Momentaufnahme; teilweise ausgeführte Löschungen werden ausdrücklich gemeldet.

### Compatibility
- Neue Metadaten `trashed` und `taskflowTrash`; Dateien bleiben bis zum Leeren am bisherigen Ort. Ältere Plugin-Versionen kennen den Papierkorb nicht und können diese Aufgaben anzeigen. Nach Nutzung des Papierkorbs nicht ohne vorherige Wiederherstellung auf ältere Versionen zurückgehen.
- Endgültiges Leeren entfernt die ausgewählten Markdown-Dateien dauerhaft; Wiederherstellung ist danach nur aus eigenen Sicherungen möglich.

## [0.14.2] - 2026-11-16

### Added
- Board-Reiter „Wiederholtermine“ mit einer kompakten Zeile je Serie bzw. geändertem Serienabschnitt, Suchfeld, Rhythmus, Zeitraum und nächstem offenen Termin.
- Zentrale Serienbearbeitung startet standardmäßig beim nächsten offenen, nicht individuell geschützten Termin mit dem Umfang „Diesen und folgende Termine“. Gibt es keinen solchen Termin, wird die Serienquelle geöffnet.
- Vorhandene Termine lassen sich pro Serie ausklappen und einzeln bearbeiten; pausierte und beendete Serien sowie Termine mit fehlender Quelle bleiben auffindbar.
- „Neue Wiederholung“ öffnet die Erfassung mit vorausgewählter wöchentlicher Wiederholung.

### Compatibility
- Der normale Aufgaben-Reiter bleibt frei von Serienterminen. Kalender, Startseite, Archiv und bisherige Schutzregeln für Serien bleiben erhalten.
- Keine automatische Veränderung oder Migration bestehender Dateien beim Öffnen der Verwaltung.

## [0.14.1] - 2026-11-16

### Changed
- Serientermine einschließlich des ersten Termins erscheinen im Kalender und auf der Startseite statt im aktiven Todo-Board. Auch bestehende Serien, Einzeltermin-Ausnahmen und beendete Serien werden anhand ihrer Herkunft erkannt.
- Board-Zähler, Suche, Tags und Filtertreffer berücksichtigen nur die dort sichtbaren Einzelaufgaben. Filterfavoriten auf der Startseite zeigen die Trefferzahl ihres Ziel-Boards.
- Tagesablauf, Status- und Prioritätenlisten sowie der Planungsvorrat zeigen keine Serientermine mehr. Im Kalender bleiben die einzelnen Termine interaktiv sichtbar.
- Ein direkter Kalenderzugang im Board erklärt, wo die Serientermine zu finden sind.

### Compatibility
- Ausschließlich eine Änderung der Ansichten: keine Termine gelöscht, keine Aufgaben archiviert, keine Änderung an Wiederholungsregeln oder Termin-Erzeugung. Vorhandene Serien werden sofort berücksichtigt.
- Archiv und statistische Auswertungen behalten die vollständige Historie einschließlich abgeschlossener und übersprungener Serientermine.

## [0.14.0] - 2026-11-16

### Added
- Zentrale Startseite „Mein Tag“: heute geplante oder fällige Aufgaben, überfällige Deadlines, nächste sieben Tage und Eingang ohne Planungsdatum.
- Aufgaben direkt öffnen, planen und abschließen; große Listen zunächst auf fünf Einträge begrenzt und vollständig aufklappbar.
- Gespeicherte Filterfavoriten mit aktueller Trefferzahl sowie direkter Einstieg in Tagesplan und Suche.
- Konfigurierbare Startansicht und ausblendbare Navigationspunkte; Startseite bleibt immer erreichbar.
- Befehl „Startseite öffnen“ für einen gezielten Einstieg, auch bei einem bereits offenen TaskFlow-Tab.

### Changed
- Neue TaskFlow-Tabs starten standardmäßig auf der Startseite. Board, Tagesplaner oder Statistik können als Startansicht gewählt werden.
- Graue Flächen folgen der bestehenden Oberfläche; ausschließlich Status und Priorität tragen semantische Farben.

### Fixed
- Häkchen der Startseite werden nach dem Speichern wieder freigegeben, auch wenn die Aufgabe währenddessen aus ihrer Liste verschwindet.

### Compatibility
- Die Versionsnummer folgt dem vereinbarten Updateplan: 0.12 war die externe Bestandsaufnahme; der Datenumzug aus 0.13 ist zurückgestellt. Es wurden keine Plugin-Versionen 0.12 oder 0.13 veröffentlicht.
- Die Startseite zeigt ausschließlich vorhandene TaskFlow-Aufgaben. Sie importiert keine TaskNotes-Dateien, ändert keine Planung beim Anzeigen und deaktiviert keine anderen Plugins.
- Bestehende Aufgabendateien und gespeicherte Filter bleiben unverändert verwendbar.

## [0.11.0] - 2026-11-13

### Added
- Benannte Filterfavoriten: Suche und Filterkombination speichern, über die Seitenleiste wieder aufrufen, umbenennen und gezielt löschen.
- Lokale dauerhafte Speicherung der Favoriten in den Plugin-Einstellungen; doppelte Namen und fehlgeschlagene Speichervorgänge werden abgefangen.
- Bearbeitungsumfang für Serientermine: „Nur diesen Termin“ oder „Diesen und folgende Termine“.
- Serienänderungen an Titel, Notizen, Teilaufgaben, Tags, Priorität, Rhythmus, Datum, Uhrzeit, Dauer und Enddatum wirken auf offene, nicht individuell geschützte Folgetermine.
- Einzeltermin überspringen: ins Archiv nehmen, ohne ihn als erledigt zu zählen; über Wiederherstellen rückgängig machen.

### Changed
- Individuelle Änderungen an Serienvorlage oder Folgeterminen bleiben bei späteren Serienänderungen erhalten; Einzeländerungen an der ursprünglichen Aufgabe verändern ihre zukünftige Vorlage nicht mehr.
- Änderungen ab einem Folgetermin teilen die Serie am ursprünglichen Termin. Nicht mehr passende offene Termine bleiben als ersetzte Serientermine im Archiv; abgeschlossene, archivierte, übersprungene und individuell geänderte Folgetermine werden nicht überschrieben.
- Erhaltene Teilaufgaben behalten ihren erledigten Zustand anhand ihres Texts; Statusänderungen gelten nur für den gewählten Termin, nicht pauschal für alle Folgetermine.
- Monatliche Serien behalten ihren ursprünglichen Monatstag auch nach Aufteilung an einem gekürzten Monatsende.
- Generationskennungen und begrenzte Dateinamen verhindern doppelte oder zu lange Pfade nach wiederholter Serienbearbeitung.
- Serienänderungen prüfen betroffene Dateistände, unterbrechen die automatische Erzeugung vorübergehend und versuchen eigene Teiländerungen bei Fehlern zurückzunehmen, ohne fremde Änderungen zu überschreiben.
- Suchänderungen aktualisieren die Favoritenmarkierung; weiterhin keine externen Bibliotheken oder Übertragung von Aufgabendaten.

## [0.10.0] - 2026-11-13

### Added
- Kompakte Suche mit aufklappbaren Filtern für Tag, Status, Priorität und Fälligkeit.
- Kombinierbare Fälligkeiten: überfällig, heute, nächste 7 Tage einschließlich heute oder ohne Termin.
- Trefferzahl, sichtbare aktive Filter, gemeinsames Zurücksetzen und verständlicher Leerzustand.
- Mehrwortsuche über Titel, Notizen, Teilaufgaben, Tags, Fälligkeits- und Planungsdatum; unabhängig von Großschreibung und Akzenten, ß und ss werden gleich behandelt.

### Changed
- Filter gelten einheitlich für Board, Tagesplaner, Kalender, Statistik und Archiv und bleiben beim Ansichtswechsel innerhalb des geöffneten TaskFlow-Tabs erhalten.
- Suche mit 120 ms Eingabepause und wiederverwendbarem Suchtext je Aufgabenstand; keine zusätzlichen Bibliotheken und keine Speicherung von Suchbegriffen im Vault.
- Escape leert das Suchfeld; Zurücksetzen löscht zusätzlich alle Filter. Die Gesamtzahlen im Board-Kopf bleiben ungefiltert, die Trefferzahl benennt die Auswahl.

## [0.9.0] - 2026-11-13

### Changed
- Durchgehend neutrale graue Bedienelemente, Navigation, Fokusmarkierungen, Fälligkeitslabels und allgemeine Diagramme; Blau-/Apricot-Akzentpalette entfernt.
- Farben ausschließlich für Status und Priorität: kontrastreichere Farbtöne für helles/dunkles Theme, beschriftete farbige Kartenlabels, größere Statuspunkte, farbige Spaltenlinien und breiterer Prioritätsrand.
- Kalenderblöcke zeigen Status am oberen Rand und Erledigen-Button, Priorität am linken Rand; Textalternativen und Hinweise ergänzt.
- Überholte Styles, ungenutzter Setting-Import und doppelte Tagesplan-Auswertung entfernt. Notiz-Verknüpfung verständlicher als „In Obsidian öffnen“ beschriftet.
- Aufgaben werden in begrenzten Gruppen mit maximal 16 parallelen Lesezugriffen statt vollständig nacheinander eingelesen.

### Fixed
- Teilaufgaben in Markdown-Codeblöcken werden beim Bearbeiten, Abhaken und Erzeugen von Serienterminen nicht mehr verändert. Plus-Listen werden einheitlich als Teilaufgaben unterstützt.
- Ungültige Statuswerte (auch Namen geerbter Objektfelder), leere Titel, fehlerhafte Tags und ungültige Fälligkeitsdaten werden beim Speichern abgefangen.
- Kurze späte Kalendertermine erweitern den sichtbaren Zeitbereich entsprechend ihrer minimalen Darstellungshöhe.
- Wechsel der Suchergebnisse räumt aktive Kalender-Ziehoperationen auf; Deaktivieren des Plugins stoppt weitere Scans und Serienerzeugung.

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
