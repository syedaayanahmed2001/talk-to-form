import type { OutputLanguage } from "@/lib/incident/fields";

/**
 * Recorded examples for demo mode.
 *
 * Each sample is the transcript of a short spoken account plus the model answers recorded for
 * it, in German and English. All people, companies and places are fictional.
 *
 * The answers are replayed through the real pipeline (lib/provider/replay.ts), so they are
 * validated, repaired and source-checked exactly like live output. The Turkish sample's first
 * answer gives the date as the word "dün" (yesterday); validation rejects it and the replayed
 * repair answer resolves it against the reference date. That is the repair step, visible in the
 * demo.
 */

export const SAMPLE_IDS = ["warehouse-tr", "kitchen-ar", "workshop-hi"] as const;
export type SampleId = (typeof SAMPLE_IDS)[number];

export type Sample = {
  id: SampleId;
  spokenLanguage: "tr" | "ar" | "hi";
  languageName: string;
  nativeName: string;
  title: Record<OutputLanguage, string>;
  /** The day the account was recorded; relative dates resolve against it. */
  referenceDate: string;
  durationSec: number;
  transcript: string;
  /** Raw model answers in call order: one when valid at once, two when a repair was needed. */
  recorded: Record<OutputLanguage, readonly unknown[]>;
};

// ---------------------------------------------------------------------------------------------
// Turkish: a box falls off a pallet at a loading ramp.

const TR_TRANSCRIPT =
  "Merhaba, ben Elif Kaya, Kuzeytaş Lojistik'te vardiya sorumlusuyum. Dün öğleden sonra saat üç " +
  "buçuk civarında, B deposunun yükleme rampasında forklift operatörümüz Murat Demirci'nin sol " +
  "ayağına paletten düşen bir koli çarptı. Çelik burunlu ayakkabı giydiği için kırık yok gibi " +
  "görünüyor ama ayağı şişti. Hemen ilk yardım çantasındaki buz torbasını koyduk ve rampayı " +
  "şeritle kapattık. Olayı depo görevlisi Selin Aydın gördü, dahili numarası 214. Paletlerin " +
  "streç filmle daha sıkı sarılması lazım, bunu cuma günkü iş güvenliği toplantısında konuşalım.";

const TR_SOURCES = {
  summary: "forklift operatörümüz Murat Demirci'nin sol ayağına paletten düşen bir koli çarptı",
  date: "Dün",
  time: "öğleden sonra saat üç buçuk civarında",
  location: "B deposunun yükleme rampasında",
  people: "ben Elif Kaya, Kuzeytaş Lojistik'te vardiya sorumlusuyum",
  injuries: "kırık yok gibi görünüyor ama ayağı şişti",
  actions: "Hemen ilk yardım çantasındaki buz torbasını koyduk ve rampayı şeritle kapattık",
  witnesses: "Olayı depo görevlisi Selin Aydın gördü, dahili numarası 214",
  followUps:
    "Paletlerin streç filmle daha sıkı sarılması lazım, bunu cuma günkü iş güvenliği toplantısında konuşalım",
};

const TR_DE = {
  summary: {
    value:
      "Herr Murat Demirci, Staplerfahrer, wurde an der Laderampe von Lager B von einem Karton am " +
      "linken Fuß getroffen, der von einer Palette fiel. Der Fuß ist geschwollen; nach erstem " +
      "Eindruck liegt kein Bruch vor.",
    source: TR_SOURCES.summary,
    confidence: "high",
  },
  date: { value: "2026-11-17", source: TR_SOURCES.date, confidence: "high" },
  time: { value: "15:30", source: TR_SOURCES.time, confidence: "medium" },
  location: {
    value: "Laderampe von Lager B, Kuzeytaş Lojistik",
    source: TR_SOURCES.location,
    confidence: "high",
  },
  peopleInvolved: {
    value: [
      { name: "Elif Kaya", role: "Schichtleiterin, meldende Person" },
      { name: "Murat Demirci", role: "Staplerfahrer, verletzte Person" },
    ],
    source: TR_SOURCES.people,
    confidence: "high",
  },
  injuries: {
    value: [
      {
        person: "Murat Demirci",
        description: "Schwellung nach Aufprall eines Kartons; nach erstem Eindruck kein Bruch",
        bodyPart: "Linker Fuß",
        treatment: "first_aid",
      },
    ],
    source: TR_SOURCES.injuries,
    confidence: "high",
  },
  immediateActions: {
    value: [
      "Kühlung mit dem Kältebeutel aus dem Erste-Hilfe-Kasten",
      "Laderampe mit Absperrband gesperrt",
    ],
    source: TR_SOURCES.actions,
    confidence: "high",
  },
  witnesses: {
    value: [{ name: "Selin Aydın", contact: "Durchwahl 214" }],
    source: TR_SOURCES.witnesses,
    confidence: "high",
  },
  followUps: {
    value: [
      { action: "Paletten fester mit Stretchfolie umwickeln", owner: null, dueDate: null },
      {
        action: "Thema in der Arbeitsschutzbesprechung am Freitag behandeln",
        owner: null,
        dueDate: "2026-11-20",
      },
    ],
    source: TR_SOURCES.followUps,
    confidence: "medium",
  },
};

const TR_EN = {
  summary: {
    value:
      "Mr Murat Demirci, forklift operator, was struck on the left foot by a box that fell from a " +
      "pallet at the loading ramp of warehouse B. The foot is swollen; at first sight there is no " +
      "fracture.",
    source: TR_SOURCES.summary,
    confidence: "high",
  },
  date: { value: "2026-11-17", source: TR_SOURCES.date, confidence: "high" },
  time: { value: "15:30", source: TR_SOURCES.time, confidence: "medium" },
  location: {
    value: "Loading ramp, warehouse B, Kuzeytaş Lojistik",
    source: TR_SOURCES.location,
    confidence: "high",
  },
  peopleInvolved: {
    value: [
      { name: "Elif Kaya", role: "Shift supervisor, reporting person" },
      { name: "Murat Demirci", role: "Forklift operator, injured person" },
    ],
    source: TR_SOURCES.people,
    confidence: "high",
  },
  injuries: {
    value: [
      {
        person: "Murat Demirci",
        description: "Swelling after being hit by a box; no fracture at first sight",
        bodyPart: "Left foot",
        treatment: "first_aid",
      },
    ],
    source: TR_SOURCES.injuries,
    confidence: "high",
  },
  immediateActions: {
    value: ["Cooled with the ice pack from the first-aid kit", "Ramp closed off with barrier tape"],
    source: TR_SOURCES.actions,
    confidence: "high",
  },
  witnesses: {
    value: [{ name: "Selin Aydın", contact: "Extension 214" }],
    source: TR_SOURCES.witnesses,
    confidence: "high",
  },
  followUps: {
    value: [
      { action: "Wrap pallets more tightly with stretch film", owner: null, dueDate: null },
      { action: "Raise the issue at Friday's safety meeting", owner: null, dueDate: "2026-11-20" },
    ],
    source: TR_SOURCES.followUps,
    confidence: "medium",
  },
};

/** The recorded first answer: the date was copied as a word instead of resolved. */
function withUnresolvedDate<T extends { date: object }>(answer: T): T {
  return { ...answer, date: { value: "dün", source: TR_SOURCES.date, confidence: "high" } };
}

// ---------------------------------------------------------------------------------------------
// Arabic: boiling water scalds a colleague's hand in a kitchen.

const AR_TRANSCRIPT =
  "اسمي يوسف حداد، وأعمل طباخاً في مطعم شركة النخلة الزرقاء. اليوم صباحاً حوالي الساعة العاشرة، " +
  "انسكب ماء مغلي من قدر كبير على يد زميلتي ليلى منصور اليمنى في المطبخ الرئيسي. وضعنا يدها تحت " +
  "الماء البارد لمدة عشرين دقيقة، ثم أخذها المدير سامي عوض إلى الطبيب. رأت الحادث أيضاً زميلتنا " +
  "نور خليل. يجب أن نشتري مقابض جديدة للقدور قبل نهاية الأسبوع، وأنا سأتابع ذلك.";

const AR_SOURCES = {
  summary: "انسكب ماء مغلي من قدر كبير على يد زميلتي ليلى منصور اليمنى في المطبخ الرئيسي",
  date: "اليوم صباحاً",
  time: "حوالي الساعة العاشرة",
  location: "في المطبخ الرئيسي",
  people: "اسمي يوسف حداد، وأعمل طباخاً",
  injuries: "ثم أخذها المدير سامي عوض إلى الطبيب",
  actions: "وضعنا يدها تحت الماء البارد لمدة عشرين دقيقة",
  witnesses: "رأت الحادث أيضاً زميلتنا نور خليل",
  followUps: "يجب أن نشتري مقابض جديدة للقدور قبل نهاية الأسبوع، وأنا سأتابع ذلك",
};

const AR_DE = {
  summary: {
    value:
      "In der Hauptküche ergoss sich kochendes Wasser aus einem großen Topf über die rechte Hand " +
      "der Mitarbeiterin Laila Mansour.",
    source: AR_SOURCES.summary,
    confidence: "high",
  },
  date: { value: "2026-11-20", source: AR_SOURCES.date, confidence: "high" },
  time: { value: "10:00", source: AR_SOURCES.time, confidence: "medium" },
  location: {
    value: "Hauptküche, Restaurant der Firma An-Nakhla Az-Zarqa",
    source: AR_SOURCES.location,
    confidence: "high",
  },
  peopleInvolved: {
    value: [
      { name: "Yousef Haddad", role: "Koch, meldende Person" },
      { name: "Laila Mansour", role: "Mitarbeiterin, verletzte Person" },
      { name: "Sami Awad", role: "Vorgesetzter" },
    ],
    source: AR_SOURCES.people,
    confidence: "high",
  },
  injuries: {
    value: [
      {
        person: "Laila Mansour",
        description: "Verbrühung durch kochendes Wasser",
        bodyPart: "Rechte Hand",
        treatment: "medical",
      },
    ],
    source: AR_SOURCES.injuries,
    confidence: "high",
  },
  immediateActions: {
    value: [
      "Hand 20 Minuten unter kaltem Wasser gekühlt",
      "Verletzte Person vom Vorgesetzten Sami Awad zum Arzt gebracht",
    ],
    source: AR_SOURCES.actions,
    confidence: "high",
  },
  witnesses: {
    value: [{ name: "Nour Khalil", contact: null }],
    source: AR_SOURCES.witnesses,
    confidence: "high",
  },
  followUps: {
    value: [
      {
        action: "Neue Topfgriffe beschaffen (vor Ende der Woche)",
        owner: "Yousef Haddad",
        dueDate: null,
      },
    ],
    source: AR_SOURCES.followUps,
    confidence: "medium",
  },
};

const AR_EN = {
  summary: {
    value:
      "In the main kitchen, boiling water spilled from a large pot onto the right hand of the " +
      "employee Laila Mansour.",
    source: AR_SOURCES.summary,
    confidence: "high",
  },
  date: { value: "2026-11-20", source: AR_SOURCES.date, confidence: "high" },
  time: { value: "10:00", source: AR_SOURCES.time, confidence: "medium" },
  location: {
    value: "Main kitchen, restaurant of An-Nakhla Az-Zarqa",
    source: AR_SOURCES.location,
    confidence: "high",
  },
  peopleInvolved: {
    value: [
      { name: "Yousef Haddad", role: "Cook, reporting person" },
      { name: "Laila Mansour", role: "Employee, injured person" },
      { name: "Sami Awad", role: "Manager" },
    ],
    source: AR_SOURCES.people,
    confidence: "high",
  },
  injuries: {
    value: [
      {
        person: "Laila Mansour",
        description: "Scald from boiling water",
        bodyPart: "Right hand",
        treatment: "medical",
      },
    ],
    source: AR_SOURCES.injuries,
    confidence: "high",
  },
  immediateActions: {
    value: [
      "Hand cooled under cold water for 20 minutes",
      "Injured person taken to a doctor by the manager, Sami Awad",
    ],
    source: AR_SOURCES.actions,
    confidence: "high",
  },
  witnesses: {
    value: [{ name: "Nour Khalil", contact: null }],
    source: AR_SOURCES.witnesses,
    confidence: "high",
  },
  followUps: {
    value: [
      {
        action: "Buy new pot handles (before the end of the week)",
        owner: "Yousef Haddad",
        dueDate: null,
      },
    ],
    source: AR_SOURCES.followUps,
    confidence: "medium",
  },
};

// ---------------------------------------------------------------------------------------------
// Hindi: a ladder rung breaks; nobody is hurt (near miss).

const HI_TRANSCRIPT =
  "मेरा नाम अर्जुन मेहता है, मैं सूरजमुखी प्रिंटिंग वर्कशॉप में तकनीशियन हूँ। परसों शाम लगभग छह बजे " +
  "स्टोर रूम में एक पुरानी सीढ़ी का पायदान टूट गया और मेरी साथी कविता राव गिरते-गिरते बचीं। किसी " +
  "को चोट नहीं लगी। हमने सीढ़ी को तुरंत अलग रख दिया और उस पर लिख दिया कि इसका इस्तेमाल न करें। " +
  "उस समय वहाँ कोई और नहीं था। सुपरवाइज़र दीपक जोशी को सोमवार तक नई सीढ़ी मँगवानी चाहिए।";

const HI_SOURCES = {
  summary: "एक पुरानी सीढ़ी का पायदान टूट गया और मेरी साथी कविता राव गिरते-गिरते बचीं",
  date: "परसों",
  time: "शाम लगभग छह बजे",
  location: "स्टोर रूम में",
  people: "मेरा नाम अर्जुन मेहता है, मैं सूरजमुखी प्रिंटिंग वर्कशॉप में तकनीशियन हूँ",
  injuries: "किसी को चोट नहीं लगी",
  actions: "हमने सीढ़ी को तुरंत अलग रख दिया और उस पर लिख दिया कि इसका इस्तेमाल न करें",
  witnesses: "उस समय वहाँ कोई और नहीं था",
  followUps: "सुपरवाइज़र दीपक जोशी को सोमवार तक नई सीढ़ी मँगवानी चाहिए",
};

const HI_DE = {
  summary: {
    value:
      "Im Lagerraum brach eine Sprosse einer alten Leiter; die Kollegin Kavita Rao konnte einen " +
      "Sturz knapp vermeiden. Es wurde niemand verletzt (Beinaheunfall).",
    source: HI_SOURCES.summary,
    confidence: "high",
  },
  date: { value: "2026-11-17", source: HI_SOURCES.date, confidence: "medium" },
  time: { value: "18:00", source: HI_SOURCES.time, confidence: "medium" },
  location: {
    value: "Lagerraum, Druckwerkstatt Surajmukhi",
    source: HI_SOURCES.location,
    confidence: "high",
  },
  peopleInvolved: {
    value: [
      { name: "Arjun Mehta", role: "Techniker, meldende Person" },
      { name: "Kavita Rao", role: "Kollegin, beinahe gestürzt" },
    ],
    source: HI_SOURCES.people,
    confidence: "high",
  },
  injuries: { value: [], source: HI_SOURCES.injuries, confidence: "high" },
  immediateActions: {
    value: [
      "Leiter sofort aus dem Verkehr gezogen",
      "Leiter mit dem Hinweis „Nicht benutzen“ beschriftet",
    ],
    source: HI_SOURCES.actions,
    confidence: "high",
  },
  witnesses: { value: [], source: HI_SOURCES.witnesses, confidence: "high" },
  followUps: {
    value: [
      { action: "Neue Leiter bestellen", owner: "Deepak Joshi (Vorgesetzter)", dueDate: "2026-11-23" },
    ],
    source: HI_SOURCES.followUps,
    confidence: "high",
  },
};

const HI_EN = {
  summary: {
    value:
      "In the store room, a rung of an old ladder broke; the colleague Kavita Rao narrowly avoided " +
      "a fall. Nobody was injured (near miss).",
    source: HI_SOURCES.summary,
    confidence: "high",
  },
  date: { value: "2026-11-17", source: HI_SOURCES.date, confidence: "medium" },
  time: { value: "18:00", source: HI_SOURCES.time, confidence: "medium" },
  location: {
    value: "Store room, Surajmukhi printing workshop",
    source: HI_SOURCES.location,
    confidence: "high",
  },
  peopleInvolved: {
    value: [
      { name: "Arjun Mehta", role: "Technician, reporting person" },
      { name: "Kavita Rao", role: "Colleague, nearly fell" },
    ],
    source: HI_SOURCES.people,
    confidence: "high",
  },
  injuries: { value: [], source: HI_SOURCES.injuries, confidence: "high" },
  immediateActions: {
    value: ["Ladder taken out of use immediately", "Ladder labelled 'Do not use'"],
    source: HI_SOURCES.actions,
    confidence: "high",
  },
  witnesses: { value: [], source: HI_SOURCES.witnesses, confidence: "high" },
  followUps: {
    value: [{ action: "Order a new ladder", owner: "Deepak Joshi (supervisor)", dueDate: "2026-11-23" }],
    source: HI_SOURCES.followUps,
    confidence: "high",
  },
};

// ---------------------------------------------------------------------------------------------

export const SAMPLES: readonly Sample[] = [
  {
    id: "warehouse-tr",
    spokenLanguage: "tr",
    languageName: "Turkish",
    nativeName: "Türkçe",
    title: {
      de: "Herabfallender Karton an der Laderampe",
      en: "Falling box at a loading ramp",
    },
    referenceDate: "2026-11-18",
    durationSec: 28,
    transcript: TR_TRANSCRIPT,
    recorded: { de: [withUnresolvedDate(TR_DE), TR_DE], en: [withUnresolvedDate(TR_EN), TR_EN] },
  },
  {
    id: "kitchen-ar",
    spokenLanguage: "ar",
    languageName: "Arabic",
    nativeName: "العربية",
    title: { de: "Verbrühung in der Küche", en: "Scald in a kitchen" },
    referenceDate: "2026-11-20",
    durationSec: 26,
    transcript: AR_TRANSCRIPT,
    recorded: { de: [AR_DE], en: [AR_EN] },
  },
  {
    id: "workshop-hi",
    spokenLanguage: "hi",
    languageName: "Hindi",
    nativeName: "हिन्दी",
    title: { de: "Gebrochene Leitersprosse, Beinaheunfall", en: "Broken ladder rung, near miss" },
    referenceDate: "2026-11-19",
    durationSec: 27,
    transcript: HI_TRANSCRIPT,
    recorded: { de: [HI_DE], en: [HI_EN] },
  },
];

export function getSample(id: SampleId): Sample {
  const sample = SAMPLES.find((s) => s.id === id);
  if (!sample) throw new Error(`Unknown sample: ${id}`);
  return sample;
}

/** The sample whose transcript this is, if any (whitespace-insensitive). */
export function matchSample(transcript: string): Sample | null {
  const squash = (s: string) => s.replace(/\s+/g, " ").trim();
  const target = squash(transcript);
  return SAMPLES.find((s) => squash(s.transcript) === target) ?? null;
}
