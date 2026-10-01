export type CorpusFixtureKind =
  "TRUE_SOURCE" | "NARRATIVE_CONTAMINATED" | "FRAGMENT" | "MERGED_SOURCES";

export interface Poc173CorpusFixtureCase {
  raw: string;
  occurrenceCount: number;
  expectedFamily:
    | "CASE_LAW"
    | "JOURNAL_ARTICLE"
    | "BOOK"
    | "COMMENTARY"
    | "FESTSCHRIFT_CONTRIBUTION"
    | "YEARBOOK_CONTRIBUTION"
    | "MANUSCRIPT"
    | "FORTHCOMING";
  kind: CorpusFixtureKind;
  expectedRelevantRules: string[];
  manualOnly: boolean;
}

const RAW_CORPUS = [
  "BGHSt. 5, 245, 248",
  "Renzikowski, Notstand und Notwehr, 1994, S. 296",
  "Schmidhäuser, Strafrecht Allgemeiner Teil, 2. Aufl. 1984, 6/80",
  "Hruschka, Strafrecht nach logisch-analytischer Methode, (Anm. 1), S. 166 ff.",
  "Bernsmann, Entschuldigung durch Notstand, 1989, S. 96",
  "Hartung, JR 1931, 61, 65 f.",
  "Henkel, Der Notstand nach gegenwärtigem und künftigem Recht, 1932, S. 122 f.",
  "von Hippel, Deutsches Strafrecht, Bd. 2, 1930, S. 231",
  "Pena-Wasaff, Der entschuldigende Notstand, 1979, S. 93 ff.",
  "BGHSt. 24, 356, 359",
  "Geilen, Jura 1981, 200",
  "Hassemer, Festschrift für Bockelmann, 1979, S. 225, 239 ff.",
  "Kasiske, Jura 2004, 832, 834 ff.",
  "Kühl, AT (Anm. 1), § 7 Rdn. 12",
  "die Ansicht, die nur auf ein kollektives Rechtsbewährungsinteresse abstellt: Bitzilekis, Die neue Tendenz zur Einschränkung des Notwehrrechts, 1984, S. 57 ff. (Verteidigung der Rechtsordnung)",
  "Haas, Notwehr und Nothilfe, 1978, S. 216 ff.",
  "Schmidhäuser, GA 1991, 97v(112 ff.)",
  "Engländer, Grund und Grenzen der Nothilfe, 2008, 9 ff., 67 ff.",
  "ders., Festschrift für Sancinetti, 2020, S. 297, 303 ff.",
  "Hruschka, Festschrift für Dreher, 1977, S. 189, 198 ff.",
  "Jansen, (Manuskript)  [x5]",
  "Renzikowski, Notstand und Notwehr (Anm. 1), S. 79 ff.",
  "Seesko, Notwehr gegen Erpressung durch Drohung mit erlaubtem Verhalten, 2004, S. 101 ff.",
  "Wagner, Notwehrbegründung (Anm. 1), S. 29 ff. (mit abweichender Ansicht zur aufgedrängten Nothilfe).",
  "Koch Nothilfe (Anm. 4), S. 135",
  "Neumann, Festschrift für Kühl, 2014, S. 569, 579",
  "Rengier, AT (Anm. 1), § 18 Rdn. 113",
  "Engländer, Nothilfe (Anm. 4), S. 91, 99 ff.",
  "ders., Festschrift für Sancinetti, S. 297, 309",
  "Renzikowski, Notstand und Notwehr (Anm. 1), S. 296.",
  "ders., Nothilfe (Anm. 6), S. 326 f.",
  "Roxin/Greco, AT (Anm. 5), § 15 Rdn. 122.",
  "ders., GA 2017, 242, 247",
  "ders., Nothilfe (Anm. 4), S. 93 Fn. 350",
  "Frister, AT (Anm. 4), § 17 Rdn. 1",
  "Renzikowski, Notstand und Notwehr (Anm. 1), S. 188 ff.",
  "überindividuelle Ansätze hingegen bei Meißner, Die Interessenabwägungsformel in der Vorschrift über den rechtfertigenden Notstand, 1990, S. 164 ff.",
  "218 ff.",
  "ders., Strafrecht nach logisch-analytischer Methode (Anm. 1), 112 ff.",
  "ders., Jahrbuch für Recht und Ethik, 2014, S. 137, 152 ff.",
  "Renzikowski, Notstand und Notwehr (Anm.1), S. 194",
  "auch Perron, in: Tübinger Kommentar StGB, 31.",
  "Aufl 2025, § 34 Rdn. 1.",
  "Hruschka, Strafrecht nach logisch-analytischer Methode (Anm. 1), S. 168  [x2]",
  "Jansen, (Manuskript).  [x5]",
  "Hruschka, Strafrecht nach logisch-analytischer Methode (Anm. 1), S. 168.",
  "ders., GA 2010, 15, 21",
  "ders., GA 2017, 242, 252 f.",
  "ders., Nothilfe (Anm. 4), S. 96 f.",
  "Kindhäuser/Zimmermann, AT (Anm. 8), § 17 Rdn. 50",
  "Renzikowski, Notstand und Notwehr (Anm. 1), S. 180 ff.",
  "Küper Der verschuldete Notstand, 1982, S. 111",
  "Pawlik, Notstand (Anm. 9), S. 295 ff.",
  "Geilen, Jura 1981, 308, 312",
  "Heller, Die aufgedrängte Nothilfe, 2004, S. 244 f. Kasiske, Jura 2004, 832, 838",
  "Kühl, AT (Anm.3) § 7 Rdn. 143 (dort auch Fn. 296)",
  "Rengier, AT (Anm. 1) § 18 Rdn. 113",
  "Roxin/Greco, AT I (Anm. 5), § 15 Rdn. 119",
  "Seeberg, Aufgedrängte Nothilfe, Notwehr und Notwehrexzess, 2005, S. 139 ff.",
  "Frister, AT (Anm. 4), § 20 Rdn. 6",
  "Roxin/Greco, AT (Anm. 5), § 22 Rdn. 25.",
  "Frister, AT (Anm. 4), Kap. 16 Rdn. 20, Kap. 17 Rdn. 7",
  "Koch, Nothilfe (Anm. 4), S. 144",
  "Neumann, Festschrift für Kühl, 2014, 569, 580 ff. (zur Einschränkung des § 216).",
  "S. eingehend auch Jansen, (Manuskript), ebenda auch zum Folgenden.",
  "Hirsch, Festschrift für Welzel, 1974, S. 775, 798 f.",
  "auch Hardtung, in: MüKo-StGB, 5. Aufl. 2025, § 228 Rdn. 23",
  "auch: Ingelfinger, Grundlagen und Grenzbereiche des Tötungsverbots, 2004, S. 225 ff.",
  "Dorneck et al., AMHE-Sterbehilfegesetz, S. 57",
  "ders., Nothilfe (Anm. 4), S. 126 ff.",
  "Festschrift für Schünemann, 2015, S. 583, 586",
  "Frister, medstra 2022, 386, 392",
  "Roxin, 140 Jahre GA 1993, 177, 184, 186",
  "Saliger, medstra 2015, 132, 134",
  "Neumann, Festschrift für Kühl, S. 569, 581.",
  "MedR 2026 (im Erscheinen)",
  "dies., HRRS 2020, 211, 214 f.",
  "Bernsmann, Notstand (Anm. 2), S. 98 Fn. 282, der dies auf § 216 StGB bezieht und daraus eine gewisse Disponibilität für § 35 StGB herleitet.",
  "von Hippel, Deutsches Strafrecht, Bd. 2, 1930, S. 231.",
  "Köhler, Strafrecht AT (Anm. 1), S. 334 f.  [x2]",
  "Neumann, Festschrift für Roxin, 2001.",
  "S. 421, 437",
  "Zimmermann, Rettungstötungen, 2009, S. 237.",
  "Henkel, Der Notstand nach gegenwärtigem und künftigem Recht, 1932, S. 123",
  "Neumann, Festschrift für Roxin, (Anm. 35), S. 421, 437",
  "Zimmermann, Rettungstötungen (Anm. 35), S. 237.",
  "Kaufmann, Dogmatik der Unterlassungsdelikte, 1959, S. 156 ff",
  "Kühl, AT (Anm. 3), § 12 Rdn. 2 f.",
  "Rengier, AT (Anm. 1), § 26 Rdn. 1",
  "Jescheck/Weigend, Strafrecht Allgemeiner Teil, (Anm. 39), S. 486.",
  "auch Bernsmann, Notstand (Anm. 2), S. 98 f.",
  "Pena-Wasaff, Der entschuldigende Notstand (Anm. 2), S. 95.",
  "Roxin/Greco, AT (Anm. 5), § 22 Rdn. 9.",
  "Pena-Wasaff, Der entschuldigende Notstand (Anm. 2), S. 94 f.",
  "Roxin/Greco, AT (Anm. 5), § 22 Rdn. 11",
  "nur generalpräventiv auf Grundlage des funktionalen Schuldbegriffs: Jakobs, AT (Anm. 28), 20. Abschn. Rdn. 4",
  "Jakobs, AT (Anm. 28), 20. Abschn. Rdn. 4.",
  "Roxin/Greco, AT (Anm. 5), § 22 Rdn. 51",
  "Roxin/Greco, AT (Anm. 5), § 22 Rdn. 51.",
  "Jakobs, AT (Anm. 28), 17. Abschn. Rdn. 75.",
  "Bernsmann, Notstand (Anm. 2), S. 254 ff., 305 ff.",
  "Momsen, Die Zumutbarkeit als Begrenzung strafrechtlicher Pflichten, 2006, S. 168 ff., 202 ff.",
  "Zimmermann, Rettungstötungen (Anm. 35), S. 227 ff.",
  "Frister, Die Struktur des voluntativen Schuldelements, 1993, S. 210 ff.",
  "Momsen, Die Zumutbarkeit als Begrenzung strafrechtlicher Pflichten (Anm. 53), S. 202.",
  "Zimmermann, Rettungstötungen (Anm. 35), S. 236 ff.",
  "Kindhäuser/Zimmermann, AT (Anm. 8), § 24 Rdn. 14",
  "Zimmermann, Rettungstötungen (Anm. 35), S. 245.",
  "Bernsmann, Notstand (Anm. 2), S. 437 f.",
  "Momsen, Die Zumutbarkeit als Begrenzung strafrechtlicher Pflichten (Anm. 53), S. 370  [x3]",
  "RGSt. 66, 397, 399 f.",
  "Bernsmann, Notstand (Anm. 2), S. 406 ff.",
  "Frister, AT (Anm. 4), § 20 Rdn. 10",
  "Jakobs, AT (Anm. 28), 20. Abschn. Rdn. 8  [x3]",
  "Lugert, Zu den erhöht Gefahrtragungspflichtigen im differenzierten Notstand, 1991, S. 108 ff.",
  "Silva Sánchez, Jahrbuch für Recht und Ethik 2005, S. 681 ff",
  "Zimmermann, Rettungstötungen (Anm. 35), S. 250 ff.",
  "Wessels/Beulke/Satzger, AT (Anm. 39), Rdn. 693.",
  "Bernsmann, Notstand (Anm. 2), S. 415",
  "Roxin/Greco, AT (Anm. 5), § 22 Rdn. 54 („Außerverhältnismäßigkeit“)",
  "Roxin/Greco, AT (Anm. 5), § 22 Rdn. 55.",
  "Jansen (Manuskript).",
  "Frister, AT (Anm. 4), § 20 Rdn. 11",
  "Rogall, in: SK-StGB (Anm. 17), § 35 Rdn. 45.",
  "Bernsmann, Notstand (Anm. 2), S. 408 f.",
  "Frister, AT (Anm. 4), § 20 Rdn. 11.",
  "Roxin/Greco, AT (Anm. 5), § 22 Rdn. 54",
  "Frister, AT (Anm. 4), § 17 Rdn. 30",
] as const;

function occurrence(raw: string): { raw: string; occurrenceCount: number } {
  const marker = /\s*\[x(\d+)\]\s*$/u.exec(raw);
  return {
    raw: raw.replace(/\s*\[x\d+\]\s*$/u, ""),
    occurrenceCount: marker ? Number(marker[1]) : 1,
  };
}

function expectedFamily(raw: string): Poc173CorpusFixtureCase["expectedFamily"] {
  if (/^(?:BGHSt|RGSt)\./u.test(raw)) return "CASE_LAW";
  if (/\(\s*Manuskript\s*\)/iu.test(raw)) return "MANUSCRIPT";
  if (/\(\s*im\s+Erscheinen\s*\)/iu.test(raw)) return "FORTHCOMING";
  if (/\b(?:Festschrift\s+für|FS\s+)/iu.test(raw)) return "FESTSCHRIFT_CONTRIBUTION";
  if (/\bJahrbuch\s+für\s+Recht\s+und\s+Ethik/iu.test(raw)) {
    return "YEARBOOK_CONTRIBUTION";
  }
  if (
    /\b(?:NJW|NStZ(?:-RR)?|JZ|JuS|Jura|JA|JR|StV|wistra|ZStW|GA|MDR|MedR|medstra|HRRS)\s+(?:19|20)\d{2}/iu.test(
      raw
    )
  ) {
    return "JOURNAL_ARTICLE";
  }
  if (/\bin\s*:\s*[^,;]*(?:Kommentar|MüKo-|SK-)/iu.test(raw)) return "COMMENTARY";
  return "BOOK";
}

function fixtureKind(raw: string): CorpusFixtureKind {
  if (/^Heller,.*\bKasiske,/u.test(raw)) return "MERGED_SOURCES";
  if (/^(?:218 ff\.|S\. 421, 437|Aufl 2025,)/u.test(raw)) return "FRAGMENT";
  if (
    /^(?:die Ansicht|überindividuelle Ansätze|nur generalpräventiv|auch(?::|\s)|S\. eingehend)/iu.test(
      raw
    )
  ) {
    return "NARRATIVE_CONTAMINATED";
  }
  return "TRUE_SOURCE";
}

export const POC_17_3_UNRESOLVED_CORPUS: readonly Poc173CorpusFixtureCase[] = RAW_CORPUS.map(
  (value) => {
    const item = occurrence(value);
    const family = expectedFamily(item.raw);
    return {
      ...item,
      expectedFamily: family,
      kind: fixtureKind(item.raw),
      expectedRelevantRules:
        family === "CASE_LAW"
          ? ["CASE_LAW_OFFICIAL_COLLECTION_PINPOINT_STYLE"]
          : family === "JOURNAL_ARTICLE"
            ? ["JOURNAL_PINPOINT_STYLE"]
            : [],
      manualOnly: family === "FORTHCOMING",
    };
  }
);

export const POC_17_3_CORPUS_TOTAL_OCCURRENCES = POC_17_3_UNRESOLVED_CORPUS.reduce(
  (sum, item) => sum + item.occurrenceCount,
  0
);
