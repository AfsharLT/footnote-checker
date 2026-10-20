#!/usr/bin/env python3
"""Create the local Mac installation guide: Markdown, standalone HTML, PDF."""
from pathlib import Path
import base64
import html
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'downloads'
ASSETS = ROOT / 'docs/installation-macos'
OUT.mkdir(exist_ok=True)
PETROL = '#18313A'
SAGE = '#43B7A3'
PAPER = '#F7F4EC'
APPLE = 'https://support.apple.com/de-de/102445'
MICROSOFT = 'https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-an-office-add-in-on-mac'

SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 180" width="900" height="180"><rect width="900" height="180" rx="12" fill="#F7F4EC"/><g font-family="Arial,sans-serif" fill="#18313A" text-anchor="middle"><text x="450" y="28" font-size="18" font-weight="bold">Wenn macOS das unsignierte Paket blockiert</text><g fill="white" stroke="#18313A"><rect x="18" y="50" width="264" height="68" rx="8"/><rect x="318" y="50" width="264" height="68" rx="8"/><rect x="618" y="50" width="264" height="68" rx="8"/></g><text x="150" y="77" font-size="17">Systemeinstellungen</text><text x="150" y="100" font-size="14">nach dem Öffnungsversuch</text><text x="450" y="77" font-size="17">Datenschutz &amp; Sicherheit</text><text x="450" y="100" font-size="14">nach unten zu Sicherheit</text><text x="750" y="77" font-size="17">Dennoch öffnen</text><text x="750" y="100" font-size="14">für FootnoteChecker.pkg bestätigen</text><text x="300" y="90" font-size="23">→</text><text x="600" y="90" font-size="23">→</text><text x="450" y="151" font-size="13">Eigene Orientierungsgrafik, kein macOS-Screenshot. Beschriftungen können je nach Version abweichen.</text></g></svg>'''
(ASSETS / 'gatekeeper-path.svg').write_text(SVG)

md = f'''# Footnote-Checker auf dem Mac installieren

**Unsignierte Mac-Beta · Installer 0.1.0 · Anleitung vom 21. Oktober 2026**

[Installer herunterladen](../downloads/FootnoteChecker.pkg) · [PDF herunterladen](../downloads/Footnote-Checker-macOS-Installation.pdf) · [HTML-Anleitung herunterladen](../downloads/Footnote-Checker-macOS-Installation.html)

Der lokale Installationstest wurde vom Nutzer am 21. Oktober 2026 bestätigt. Das Paket richtet den Footnote-Checker für das eigene Benutzerkonto ein; Gatekeeper- und Organisationsdialoge können je nach Mac abweichen.

## 1. Vorbereiten und öffnen

1. Auf dem Mac muss **Microsoft Word Desktop** installiert sein. Word für dein Benutzerkonto einmal öffnen, falls es frisch installiert ist. Das PKG setzt macOS 12 oder neuer voraus; dies garantiert nicht jede Word-Version.
2. Offene Dokumente speichern. Word über **Word → Word beenden** oder **Cmd+Q** vollständig beenden. Ein geschlossenes Dokumentfenster reicht nicht.
3. **FootnoteChecker.pkg** herunterladen bzw. die lokal bereitgestellte Datei verwenden. Ein ZIP ist nicht nötig. Falls du das optionale ZIP nutzt, zuerst vollständig entpacken.
4. Im Finder **Downloads** öffnen und **FootnoteChecker.pkg** doppelt anklicken.

## 2. Nur bei einer Gatekeeper-Warnung: bewusst freigeben

Das Paket ist derzeit **nicht signiert und nicht notarisiert**. Falls macOS den Entwickler nicht bestätigen kann, ist eine Freigabe für genau diese vertrauenswürdig bezogene Paketdatei nötig.

1. Nach dem blockierten Öffnungsversuch die Meldung schließen; das Paket behalten.
2. **Apple-Menü → Systemeinstellungen → Datenschutz & Sicherheit** öffnen.
3. Nach unten zum Bereich **Sicherheit** scrollen und den Eintrag für **FootnoteChecker.pkg** suchen.
4. **Dennoch öffnen** wählen. Je nach macOS-Version kann die Formulierung ähnlich lauten. Wenn macOS eine Passwort- oder Touch-ID-Bestätigung fordert, direkt im macOS-Dialog bestätigen.
5. Die erneute Rückfrage mit **Öffnen** bestätigen. Nun startet der normale Installer.

![Orientierung zum Gatekeeper-Menüpfad, ausdrücklich kein echter macOS-Screenshot](installation-macos/gatekeeper-path.svg)

Die Grafik zeigt den Weg, nicht eine nachgestellte Systemwarnung. Die Installer-Bilder darunter sind echte, am 21. Oktober 2026 aufgenommene Screenshots. Ein Gatekeeper-Dialog wurde für diese Bilder nicht nachgestellt. Auf macOS 12 heißt der Bereich je nach Version **Sicherheit & Datenschutz → Allgemein**. Bei Schadsoftware-/Beschädigt-Meldungen nicht fortfahren. Bei verwalteten Geräten ohne Freigabeoption die IT kontaktieren. Gatekeeper wird nicht global abgeschaltet. Ein neues Paket kann erneut eine Freigabe benötigen. [Apples Anleitung]({APPLE}).

## 3. Den normalen Installer durchlaufen

1. In der Einführung auf **Fortfahren** klicken.
2. Die kurze Hinweisseite lesen und erneut **Fortfahren** wählen.

![Echter Screenshot: Einführung des neuen Footnote-Checker-PKG](installation-macos/installer-welcome.png)

![Echter Screenshot: Hinweisseite zum Ziel und zu den Voraussetzungen](installation-macos/installer-readme.png)

3. Falls eine Zielauswahl erscheint, **Nur für mich installieren** wählen. Die Standardinstallation ist für dein Benutzerkonto vorgesehen, nicht für andere Benutzer dieses Macs.
4. **Installieren** klicken. Keine Terminalbefehle, kein zusätzliches Script und keine App zum Verschieben in „Programme“ erforderlich. Für die benutzerbezogene Installation sind keine Administratorrechte vorgesehen; Gatekeeper oder macOS können trotzdem eine eigene Bestätigung verlangen.

![Echter Screenshot: normale macOS-Installation im Benutzerordner](installation-macos/installer-install.png)

5. Falls der Installer dich auffordert, Word zu schließen: Dokumente sichern und Word regulär beenden. Nicht ungespeichert erzwingen.
6. Warten, bis der Installer den erfolgreichen Abschluss meldet, dann **Schließen** wählen. Ein Mac-Neustart ist nicht nötig.

Die Aufnahmen zeigen Installer 0.1.0 auf macOS. Der Nutzer hat den lokalen Installationstest bestätigt; die Screenshots dokumentieren die einzelnen Schritte, nicht eine nachgestellte Erfolgsmeldung.

## 4. Footnote-Checker in Word öffnen

1. Word starten und ein Dokument öffnen.
2. **Start → Add-Ins → Footnote-Checker** wählen. Je nach Word-Version unter **Weitere Add-Ins / Meine Add-Ins / Entwicklertool-Add-Ins** nachsehen.
3. Zuerst eine **Dokumentkopie** im Modus **Analyse** prüfen. Dabei wird der Dokumenttext nicht geändert.
4. Anschließend Zitiereinstellungen und Literaturverzeichnis öffnen; erst danach sichere Korrekturen testen.

![Vorhandenes Beispiel der Word-Oberfläche; kein Screenshot aus einem abgeschlossenen PKG-Installationstest](screenshots/word-start.png)

Internet ist erforderlich: Das Paket registriert die Word-Konfiguration, die Oberfläche lädt vom gehosteten Footnote-Checker. Der Installer enthält keinen eingefrorenen POC-17.7-Anwendungsbuild und aktualisiert das Hosting nicht. Microsoft beschreibt diesen [Mac-Testinstallationsweg]({MICROSOFT}).

## Wenn etwas nicht klappt

| Meldung oder Problem | Nächster Schritt ohne Terminal |
| --- | --- |
| Word muss beendet werden | Dokumente speichern und Word mit Cmd+Q schließen; Installation erneut starten. |
| Word-Ordner fehlt | Word einmal öffnen, Dokument öffnen, Word beenden und Paket erneut starten. |
| Keine Freigabeoption / verwalteter Mac | IT um Freigabe bitten. Keine Sicherheitsrichtlinien ändern. |
| Zugriff auf den Word-Ordner wird verweigert | Falls macOS den Zugriff ausdrücklich anfragt, den Dialog prüfen; bei fortbestehendem Fehler Screenshot aufnehmen und melden. Nicht mit Terminalbefehlen improvisieren. |
| Add-in fehlt | Word vollständig beenden und neu öffnen, Dokument öffnen, Add-in-Menü erneut prüfen. |
| Add-in lädt nicht / leere Oberfläche | Internet-/Dienstverbindung und Office-Add-in-Freigabe prüfen. Eine erfolgreiche PKG-Installation allein beweist keinen funktionierenden Hostingdienst. |
| Installer meldet Fehler | Fehlermeldung und macOS-/Word-Version senden. Die vorhandene Konfiguration wird nicht absichtlich mit unvollständigen Daten überschrieben. |

## Was wird gespeichert? Aktualisieren und entfernen

Die Konfiguration liegt in `~/Library/Containers/com.microsoft.Word/Data/Documents/wef/manifest.production.xml`. Geänderte frühere FNC-Dateien werden unter `~/Library/Application Support/Footnote-Checker/Installer Backups/` gesichert. Identische Neuinstallationen erzeugen keine zusätzliche Sicherung. Andere Add-ins und deine lokal gespeicherten FNC-Einstellungen bleiben erhalten.

Für ein Manifest-Update das neue PKG bei beendetem Word erneut öffnen. Für reine Webcode-Updates ist normalerweise keine Neuinstallation nötig. Zum Entfernen Word beenden und ausschließlich die FNC-Datei über den Finder entfernen; keine anderen Manifestdateien oder den Word-Container löschen. Vor Cachebereinigung FNC-Einstellungen exportieren.

**Mac-Beta:** Der lokale Installationstest wurde bestätigt. Tests weiterer macOS-/Word-Versionen und verwalteter Geräte sowie einzelne Gatekeeper-/Update-Szenarien sind dadurch nicht automatisch abgedeckt.
'''
(ROOT / 'docs/MACOS_INSTALLATION.md').write_text(md)

# A self-contained HTML guide: local images are embedded, so it works after download.
# Keep text in the canonical Markdown; only a small Markdown subset is needed here.
import re
parts = []
table_rows = []
def flush_table():
    if not table_rows: return
    parts.append('<table>')
    for index, cells in enumerate(table_rows):
        if all(re.fullmatch(r':?-+:?', cell.strip()) for cell in cells): continue
        tag = 'th' if index == 0 else 'td'
        parts.append('<tr>' + ''.join('<'+tag+'>'+html.escape(cell.strip())+'</'+tag+'>' for cell in cells) + '</tr>')
    parts.append('</table>'); table_rows.clear()
for line in md.splitlines():
    image = re.fullmatch(r'!\[([^]]*)\]\(([^)]+)\)', line)
    if image:
        path = ROOT / 'docs' / image[2]
        mime = 'image/svg+xml' if path.suffix == '.svg' else 'image/png'
        parts.append(f'<figure><img alt="{html.escape(image[1])}" src="data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"><figcaption>{html.escape(image[1])}</figcaption></figure>')
        continue
    if line.startswith('|'):
        table_rows.append(line.strip('|').split('|')); continue
    flush_table()
    if not line.strip():
        continue
    line = html.escape(line)
    line = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', line)
    line = re.sub(r'`([^`]+)`', r'<code>\1</code>', line)
    line = re.sub(r'\[([^]]+)\]\(([^)]+)\)', lambda m: '<a href="'+html.escape(m[2].replace('../downloads/',''))+'">'+m[1]+'</a>', line)
    if line.startswith('# '): parts.append('<h1>'+line[2:]+'</h1>')
    elif line.startswith('## '): parts.append('<h2>'+line[3:]+'</h2>')
    elif line.startswith('|'): parts.append('<p class="trouble">'+line+'</p>')
    else: parts.append('<p>'+line+'</p>')
css = 'body{font:17px/1.55 -apple-system,Arial,sans-serif;color:#18313A;max-width:900px;margin:40px auto;padding:0 24px;background:white}h1{font-size:32px}h2{margin-top:40px;border-top:1px solid #dce5e5;padding-top:24px}img{max-width:100%;height:auto;border:1px solid #dce5e5;border-radius:10px}figcaption{font-size:13px;color:#52616a}figure{margin:20px 0}a{color:#18313A}code{overflow-wrap:anywhere;font-size:13px}table{border-collapse:collapse;font-size:14px;width:100%}th,td{padding:10px;border:1px solid #dce5e5;text-align:left;vertical-align:top}th{background:#F7F4EC} @media print{body{margin:0;font-size:11pt}h2{break-after:avoid}figure{break-inside:avoid}}'
flush_table()
(OUT / 'Footnote-Checker-macOS-Installation.html').write_text('<!doctype html><html lang="de"><meta charset="utf-8"><title>Footnote-Checker: Installation auf macOS</title><style>'+css+'</style><body>'+''.join(parts)+'</body></html>')

pdfmetrics.registerFont(TTFont('FNC', '/System/Library/Fonts/Supplemental/Arial.ttf'))
pdfmetrics.registerFont(TTFont('FNCBold', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'))
pdfmetrics.registerFontFamily('FNC', normal='FNC', bold='FNCBold', italic='FNC', boldItalic='FNCBold')
c = canvas.Canvas(str(OUT / 'Footnote-Checker-macOS-Installation.pdf'), pagesize=(595.28,841.89))
c.setTitle('Footnote-Checker - Installation auf macOS'); c.setAuthor('Footnote-Checker')
style = ParagraphStyle('FNC',fontName='FNC',fontSize=11,leading=16,textColor=colors.HexColor(PETROL),spaceAfter=8)
small = ParagraphStyle('small',parent=style,fontSize=9,leading=13)

def text(s,y,x=48,w=499,st=style):
    p = Paragraph(s,st); _,h=p.wrap(w,800);p.drawOn(c,x,y-h);return y-h-10

def header(n,title):
    c.setFillColor(colors.HexColor(PETROL));c.rect(0,780,596,62,fill=1,stroke=0)
    c.setFillColor(colors.white);c.setFont('FNCBold',18);c.drawString(48,804,'Footnote-Checker')
    c.setFillColor(colors.HexColor(PETROL));c.setFont('FNCBold',20);c.drawString(48,744,title)
    c.setFont('FNC',9);c.setFillColor(colors.HexColor('#52616A'));c.drawString(48,724,'Mac-Beta · Installer 0.1.0 · 21. Oktober 2026')
    c.setStrokeColor(colors.HexColor(SAGE));c.line(48,711,547,711)
    c.setFont('FNC',9);c.drawString(48,25,'Keine Terminaleingabe erforderlich');c.drawRightString(547,25,f'{n} / 5')

def image(path,top,width=475):
    from reportlab.lib.utils import ImageReader
    im=ImageReader(str(path));iw,ih=im.getSize();h=width*ih/iw
    c.drawImage(im, (595.28-width)/2,top-h,width=width,height=h,mask='auto')
    return top-h

header(1,'1. Vorbereiten und freigeben')
y=text('<b>Word Desktop muss installiert sein.</b> Falls es frisch installiert ist, einmal öffnen. Dokumente speichern und Word mit <b>Cmd+Q</b> vollständig beenden. Das Paket setzt macOS 12 oder neuer voraus.',687)
y=text('<b>FootnoteChecker.pkg</b> verwenden und im Finder doppelt anklicken. Ein ZIP ist nicht nötig. Das Paket ist unsigniert und nicht notarisiert.',y)
y=text('<b>Nur wenn macOS das Paket blockiert:</b>',y)
for s in ['1. Den blockierten Öffnungsversuch schließen und die Paketdatei behalten.','2. Apple-Menü → <b>Systemeinstellungen → Datenschutz &amp; Sicherheit</b>.','3. Nach unten zu <b>Sicherheit</b> scrollen. Bei FootnoteChecker.pkg <b>Dennoch öffnen</b> wählen.','4. Eine Passwort-/Touch-ID-Abfrage im macOS-Dialog bestätigen, falls sie erscheint. Danach die erneute Rückfrage mit <b>Öffnen</b> bestätigen.']:
 y=text(s,y)
c.setFillColor(colors.HexColor(PAPER));c.roundRect(48,y-95,499,85,9,fill=1,stroke=0)
y=text('Systemeinstellungen<br/><b>Datenschutz &amp; Sicherheit → Sicherheit → Dennoch öffnen</b>',y-22,x=62,w=470)
y-=45
y=text('Orientierung, kein Screenshot: Die Menübezeichnungen können abweichen. Unter macOS 12 gegebenenfalls Sicherheit &amp; Datenschutz → Allgemein öffnen.',y,st=small)
y=text('Nur die bewusst bezogene Paketdatei freigeben. Bei Schadsoftware-/Beschädigt-Meldungen nicht fortfahren. Fehlt die Freigabeoption auf einem verwalteten Mac, hilft die IT. Ein neues Paket kann erneut eine Freigabe benötigen.',y,st=small)
y=text(f'<a href="{APPLE}">Apple: Sichere Apps auf dem Mac öffnen</a>',y,st=small)
c.showPage()
header(2,'2. Den Installer starten')
y=text('Die Einführung bestätigt: Installation für dein Benutzerkonto, ohne Terminal und ohne manuelles Kopieren.',687)
bottom=image(ASSETS/'installer-welcome.png',y)
y=text('Echter Screenshot der Einführung des lokal gebauten PKG.',bottom-8,st=small)
y=text('<b>Fortfahren</b> wählen. Auf der kurzen Hinweisseite noch einmal <b>Fortfahren</b> klicken.',y-10)
y=text('Falls eine Zielauswahl erscheint: <b>Nur für mich installieren</b> wählen. Das Paket benötigt keine zusätzliche App und keinen Ordner unter „Programme“.',y)
y=text('Eine ältere FNC-Konfiguration wird vor dem Ersetzen gesichert. Andere Add-ins und deine lokal gespeicherten Einstellungen bleiben erhalten.',y)
c.showPage()
header(3,'3. Hinweise und Installationsziel')
y=text('Die Hinweisseite erklärt, was eingerichtet wird: eine Word-Konfiguration für dein Konto, mit Sicherung einer älteren FNC-Datei.',687)
bottom=image(ASSETS/'installer-readme.png',y)
y=text('Echter Screenshot der kurzen Hinweisseite.',bottom-8,st=small)
y=text('Hier erneut <b>Fortfahren</b> wählen. Falls danach eine Zielauswahl erscheint, <b>Nur für mich installieren</b> auswählen.',y-10)
y=text('Andere Add-ins und deine lokal gespeicherten FNC-Einstellungen bleiben erhalten. Das Paket installiert keine zusätzliche App.',y)
c.showPage()
header(4,'4. Installation abschließen')
y=text('<b>Installieren</b> anklicken. Die Standardinstallation ist für dein eigenes Benutzerkonto vorgesehen.',687)
bottom=image(ASSETS/'installer-install.png',y)
y=text('Echter Screenshot vor dem abschließenden Installieren-Klick.',bottom-8,st=small)
y=text('Falls Word noch läuft, fordert der normale Installer zum Schließen auf. Dokumente zuerst sichern und Word regulär beenden.',y-10)
y=text('Bis zur Erfolgsmeldung warten und anschließend <b>Schließen</b> wählen. Es sind keine Terminalbefehle und kein Neustart des Macs nötig.',y)
y=text('Die benutzerbezogene Installation ist ohne Administratorrechte vorgesehen. macOS kann für eine Gatekeeper-Freigabe oder einen Zugriff trotzdem eine eigene Bestätigung verlangen.',y,st=small)
c.showPage()
header(5,'5. In Word prüfen')
y=text('Word starten, ein Dokument öffnen und <b>Start → Add-Ins → Footnote-Checker</b> wählen. Je nach Version unter Weitere Add-Ins / Meine Add-Ins / Entwicklertool-Add-Ins nachsehen.',687)
bottom=image(ROOT/'docs/screenshots/word-start.png',y)
y=text('Vorhandenes Beispiel der Word-Oberfläche; kein abgeschlossener PKG-Test.',bottom-8,st=small)
y=text('1. Zuerst eine <b>Dokumentkopie</b> im Modus <b>Analyse</b> prüfen.<br/>2. Zitiereinstellungen und Literaturverzeichnis öffnen.<br/>3. Danach sichere Korrekturen bewusst testen.',y)
y=text('<b>Add-in fehlt?</b> Word mit Cmd+Q beenden, erneut öffnen, ein Dokument laden und das Add-in-Menü erneut prüfen. Fehlt der Word-Ordner beim Installieren, Word vorher einmal vollständig starten.',y)
y=text('<b>Leere Oberfläche oder Ladefehler?</b> Internet, Hostingdienst und Office-Add-in-Freigabe prüfen. Der Installer registriert die Konfiguration und aktualisiert nicht die gehostete Anwendung. Kein Node.js oder VS Code erforderlich.',y)
y=text('Bei Fehlern macOS-/Word-Version, Schritt und Screenshot senden. Keine Terminalbefehle improvisieren oder Schutzfunktionen abschalten. Die vollständige HTML-/GitHub-Anleitung enthält Zielpfad, Sicherung und Entfernen.',y,st=small)
y=text(f'<a href="{MICROSOFT}">Microsoft: Mac-Installation von Office-Add-ins</a>',y,st=small)
c.save()
print('Guide generated: Markdown, self-contained HTML and 5-page PDF.')
