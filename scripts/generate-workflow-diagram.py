#!/usr/bin/env python3
"""Generate the editable draw.io architecture source; SVG is exported with draw.io."""
from pathlib import Path
from xml.etree.ElementTree import Element,SubElement,ElementTree
ROOT=Path(__file__).resolve().parent.parent
mxfile=Element('mxfile',host='app.diagrams.net',type='device')
diagram=SubElement(mxfile,'diagram',name='FNC – technischer Workflow',id='fnc-workflow')
model=SubElement(diagram,'mxGraphModel',dx='1100',dy='880',grid='1',gridSize='10',page='0',pageScale='1',pageWidth='1100',pageHeight='880',math='0',shadow='0',background='#ffffff')
root=SubElement(model,'root');SubElement(root,'mxCell',id='0');SubElement(root,'mxCell',id='1',parent='0')

def box(key,x,y,w,h,label,fill='#ffffff',font=16,bold=False,stroke='#18313A',text=False):
 style=f'rounded=1;whiteSpace=wrap;html=0;fillColor={fill};strokeColor={stroke};fontColor=#18313A;fontFamily=Helvetica;fontSize={font};fontStyle={1 if bold else 0};align=center;verticalAlign=middle;spacing=8;arcSize=10;'
 if text:style+='fillColor=none;strokeColor=none;'
 cell=SubElement(root,'mxCell',id=key,value=label,style=style,vertex='1',parent='1')
 SubElement(cell,'mxGeometry',x=str(x),y=str(y),width=str(w),height=str(h),attrib={'as':'geometry'})

def edge(key,source,target,ex=1,ey=.5,ix=0,iy=.5,dashed=False):
 style=f'edgeStyle=orthogonalEdgeStyle;rounded=0;html=0;strokeColor=#18313A;strokeWidth=1.5;endArrow=block;endFill=1;exitX={ex};exitY={ey};entryX={ix};entryY={iy};exitPerimeter=1;entryPerimeter=1;'
 if dashed:style+='dashed=1;'
 c=SubElement(root,'mxCell',id=key,style=style,edge='1',parent='1',source=source,target=target)
 SubElement(c,'mxGeometry',relative='1',attrib={'as':'geometry'})

box('title',20,0,1060,42,'Footnote-Checker · vom Dokument zur sicheren Änderung',font=24,bold=True,text=True)
box('read-zone',20,62,1060,142,'',fill='#F7F4EC',stroke='#D5DFE0')
box('read-label',36,68,730,32,'1 · EINLESEN',font=17,bold=True,text=True)
box('word',40,110,185,68,'Word-Dokument\nFußnoten + Formatierung',font=15)
box('reader',265,110,220,68,'Footnote Reader · Office.js\nGebündelte Leseabschnitte',font=15)
box('snapshot',525,110,220,68,'Lokale Snapshots\nText · Position · Schutz · Format',font=15)
box('settings',800,110,260,68,'Lokale Einstellungen\nZitierprofil · Werke · Abkürzungen',fill='#F1FAF7',stroke='#43B7A3',font=15)
edge('word-reader','word','reader');edge('reader-snapshot','reader','snapshot')
box('engine',20,236,1060,216,'',fill='#F7F4EC',stroke='#D5DFE0')
box('engine-label',36,242,1008,32,'2 · FOOTNOTE ENGINE – regelbasierte Analyse',font=17,bold=True,text=True)
box('parser',40,290,300,72,'Parser\nQuellen trennen\nZitierart und Fundstellen erkennen',font=15)
box('mapping',400,290,300,72,'Werk-Mapping + Quellenregister\nWerke identifizieren\nVoll- und Kurzbelege verbinden',font=15)
box('rules',760,290,300,72,'Rule Engine\nZitier- und Formatregeln prüfen\nmit dem lokalen Zitierprofil',font=15)
box('findings',400,394,660,40,'Prüfhinweise: Regel · Original · Vorschlag · Textposition',font=15)
edge('snapshot-engine','snapshot','engine',.5,1,.58,0)
edge('settings-rules','settings','rules',.5,1,.5,0,True)
edge('parser-mapping','parser','mapping');edge('mapping-rules','mapping','rules')
edge('rules-findings','rules','findings',.5,1,.773,0)
box('review-zone',20,488,1060,316,'',fill='#F7F4EC',stroke='#D5DFE0')
box('review-label',36,494,1008,32,'3 · BEWERTEN UND ANWENDEN',font=17,bold=True,text=True)
box('review',40,538,1020,52,'Review Engine: Sicherheit und Konflikte bewerten\nAUTO · MANUAL · TECHNICAL · INFO',font=16)
edge('findings-review','findings','review',.5,1,.676,0)
box('analysis',40,628,300,64,'Analyse\nErgebnisse anzeigen',font=17)
box('manual',400,628,300,64,'Prüfung\nEinzeln entscheiden und freigeben',font=17)
box('auto',760,628,300,64,'Korrektur\nSichere AUTO-Aktionen ausführen',font=17)
for key,port in [('analysis',.147),('manual',.5),('auto',.853)]:edge('review-'+key,'review',key,port,1,.5,0)
box('analysis-note',40,722,300,64,'Keine Dokumentänderung.\nUnsichere Stellen bleiben sichtbar.',font=15,text=True)
box('write',400,730,660,58,'Write-back Engine → Word aktualisieren\nZiel erneut prüfen → sichere Aktionen gebündelt schreiben',fill='#F1FAF7',stroke='#43B7A3',font=16)
edge('manual-write','manual','write',.5,1,.227,0);edge('auto-write','auto','write',.5,1,.773,0)
box('outputs',20,824,1060,36,'Ergebnisliste in Word · Zur Fußnote springen · CSV-Bericht exportieren',font=16,text=True)
ElementTree(mxfile).write(ROOT/'docs/technical-workflow.drawio',encoding='utf-8',xml_declaration=True)
print('Editable draw.io source generated.')
