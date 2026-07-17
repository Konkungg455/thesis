/**
 * English fixed screening questions (32 symptoms × 5).
 * Keys stay Thai so they match category query / BANK.
 */

export type FixedQuestionEn = {
  header: string;
  sub: string;
  hint: string;
};

const Q2 = (label: string): FixedQuestionEn => ({
  header: 'Severity and duration',
  sub: `How severe is the ${label} and when did it start`,
  hint: 'mild today, moderate yesterday, severe 2-3 days ago, more than 1 week',
});

const Q3 = (): FixedQuestionEn => ({
  header: 'Triggers or things that make it better/worse',
  sub: 'What triggers it or makes it better/worse',
  hint: 'food, rest, medicine, unknown',
});

const Q4 = (): FixedQuestionEn => ({
  header: 'Important accompanying symptoms',
  sub: 'Do you have any other symptoms',
  hint: 'none, fever, nausea, fatigue',
});

const Q5 = (): FixedQuestionEn => ({
  header: 'Self-care already tried',
  sub: 'What have you already done to care for yourself',
  hint: 'nothing yet, painkiller, rest, bought medicine myself',
});

export const MENSTRUAL_Q1_FOR_MALE_EN: FixedQuestionEn = {
  header: "Sister/daughter/partner/mother's menstrual pain pattern",
  sub: 'What is it like',
  hint: 'cramping lower abdomen, pain radiating to the back, dull pain on both sides',
};

export const MENSTRUAL_Q1_FOR_UNKNOWN_EN: FixedQuestionEn = {
  header: 'Your own or sister/daughter/partner/mother menstrual pain pattern',
  sub: 'What is it like (please say who you are asking for)',
  hint: 'myself cramping, sister back pain, partner dull bilateral pain',
};

export const SYMPTOM_LABEL_EN: Record<string, string> = {
  'ปวดศีรษะ': 'headache',
  'เวียนศีรษะ': 'dizziness',
  'ปวดข้อ': 'joint pain',
  'ปวดกล้ามเนื้อ': 'muscle pain',
  'ไข้': 'fever',
  'ไอ': 'cough',
  'เจ็บคอ': 'sore throat',
  'ปวดท้อง': 'abdominal pain',
  'ท้องเสีย': 'diarrhea',
  'ท้องผูก': 'constipation',
  'ริดสีดวงทวาร': 'hemorrhoids',
  'คลื่นไส้/อาเจียน': 'nausea/vomiting',
  'กรดไหลย้อน': 'acid reflux',
  'ปวดประจำเดือน': 'menstrual pain',
  'ตกขาวผิดปกติ': 'abnormal vaginal discharge',
  'ผื่นคัน': 'itchy rash',
  'บาดแผลทั่วไป': 'minor wound',
  'แมลงสัตว์กัดต่อย': 'insect/animal bite or sting',
  'แผลถลอก/ไหม้': 'abrasion/burn',
  'ผื่นแพ้': 'allergic rash',
  'กลาก/เกลื้อน': 'ringworm/tinea',
  'หิด/เหา': 'scabies/lice',
  'ฝีหนอง': 'boil/abscess',
  'แผลในปาก': 'mouth ulcer',
  'ปวดฟัน': 'toothache',
  'ตาแดง': 'red eye',
  'ตากุ้งยิง': 'stye',
  'หูอักเสบ': 'ear infection',
  'คัดจมูก/น้ำมูกไหล': 'nasal congestion/runny nose',
  'ภูมิแพ้': 'allergy',
  'นอนไม่หลับ': 'insomnia',
  'วิตกกังวล': 'anxiety',
};

/** English aliases → Thai symptom key */
export const ALIASES_EN: Record<string, string> = {
  headache: 'ปวดศีรษะ',
  migraine: 'ปวดศีรษะ',
  dizziness: 'เวียนศีรษะ',
  vertigo: 'เวียนศีรษะ',
  'joint pain': 'ปวดข้อ',
  'muscle pain': 'ปวดกล้ามเนื้อ',
  myalgia: 'ปวดกล้ามเนื้อ',
  fever: 'ไข้',
  cough: 'ไอ',
  'sore throat': 'เจ็บคอ',
  'stomach ache': 'ปวดท้อง',
  'abdominal pain': 'ปวดท้อง',
  stomachache: 'ปวดท้อง',
  diarrhea: 'ท้องเสีย',
  diarrhoea: 'ท้องเสีย',
  constipation: 'ท้องผูก',
  hemorrhoid: 'ริดสีดวงทวาร',
  hemorrhoids: 'ริดสีดวงทวาร',
  piles: 'ริดสีดวงทวาร',
  nausea: 'คลื่นไส้/อาเจียน',
  vomiting: 'คลื่นไส้/อาเจียน',
  'acid reflux': 'กรดไหลย้อน',
  gerd: 'กรดไหลย้อน',
  'menstrual pain': 'ปวดประจำเดือน',
  period: 'ปวดประจำเดือน',
  'period pain': 'ปวดประจำเดือน',
  dysmenorrhea: 'ปวดประจำเดือน',
  discharge: 'ตกขาวผิดปกติ',
  'vaginal discharge': 'ตกขาวผิดปกติ',
  'itchy rash': 'ผื่นคัน',
  rash: 'ผื่นคัน',
  allergy: 'ภูมิแพ้',
  'allergic rash': 'ผื่นแพ้',
  hives: 'ผื่นแพ้',
  wound: 'บาดแผลทั่วไป',
  cut: 'บาดแผลทั่วไป',
  bite: 'แมลงสัตว์กัดต่อย',
  sting: 'แมลงสัตว์กัดต่อย',
  burn: 'แผลถลอก/ไหม้',
  abrasion: 'แผลถลอก/ไหม้',
  ringworm: 'กลาก/เกลื้อน',
  tinea: 'กลาก/เกลื้อน',
  scabies: 'หิด/เหา',
  lice: 'หิด/เหา',
  boil: 'ฝีหนอง',
  abscess: 'ฝีหนอง',
  'mouth ulcer': 'แผลในปาก',
  'canker sore': 'แผลในปาก',
  toothache: 'ปวดฟัน',
  'tooth pain': 'ปวดฟัน',
  'red eye': 'ตาแดง',
  conjunctivitis: 'ตาแดง',
  stye: 'ตากุ้งยิง',
  'ear infection': 'หูอักเสบ',
  congestion: 'คัดจมูก/น้ำมูกไหล',
  'runny nose': 'คัดจมูก/น้ำมูกไหล',
  'stuffy nose': 'คัดจมูก/น้ำมูกไหล',
  insomnia: 'นอนไม่หลับ',
  anxiety: 'วิตกกังวล',
};

export const BANK_EN: Record<string, FixedQuestionEn[]> = {
  'ปวดศีรษะ': [
    { header: 'Headache pattern', sub: 'What kind of headache do you have', hint: 'throbbing, dull, sharp, all-around head pain' },
    Q2('pain'),
    { header: 'Triggers and context', sub: 'What triggers it or makes it better/worse', hint: 'bright light, lack of sleep, stress, unknown' },
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, nausea, blurred vision, stiff neck' },
    Q5(),
  ],
  'เวียนศีรษะ': [
    { header: 'Dizziness pattern', sub: 'How does it feel', hint: 'room spinning, lightheaded, unsteady, about to faint' },
    Q2('symptom'),
    { header: 'Triggers and context', sub: 'What triggers it or makes it better/worse', hint: 'standing up quickly, rest, turning the neck, unknown' },
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, spinning sensation, ringing ears, nausea' },
    Q5(),
  ],
  'ปวดข้อ': [
    { header: 'Joint pain pattern', sub: 'Which joint and what kind of pain', hint: 'dull knee pain, swollen wrist pain, sharp finger joint pain' },
    Q2('pain'),
    Q3(),
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, swollen joint, warm joint, hard to move' },
    Q5(),
  ],
  'ปวดกล้ามเนื้อ': [
    { header: 'Muscle pain pattern', sub: 'Where is the pain and what is it like', hint: 'tight neck-shoulder, dull back pain, calf cramp' },
    Q2('pain'),
    { header: 'Triggers and context', sub: 'What triggers it or makes it better/worse', hint: 'heavy lifting, sitting long, rest, massage' },
    Q4(),
    Q5(),
  ],
  'ไข้': [
    { header: 'Fever pattern', sub: 'What is the fever like and about how high', hint: 'low-grade fever, high fever, chills, hot all day' },
    Q2('fever'),
    Q3(),
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, cough, sore throat, headache' },
    Q5(),
  ],
  'ไอ': [
    { header: 'Cough pattern', sub: 'What kind of cough', hint: 'dry cough, productive cough, night cough, frequent cough' },
    Q2('cough'),
    Q3(),
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, fever, sore throat, shortness of breath' },
    Q5(),
  ],
  'เจ็บคอ': [
    { header: 'Sore throat pattern', sub: 'What kind of sore throat', hint: 'burning pain, pain when swallowing, dry throat, white patches' },
    Q2('pain'),
    Q3(),
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, fever, cough, swollen lymph nodes' },
    Q5(),
  ],
  'ปวดท้อง': [
    { header: 'Abdominal pain pattern', sub: 'Where is the pain and what is it like', hint: 'upper cramping, lower dull pain, periumbilical burning' },
    Q2('pain'),
    { header: 'Triggers and context', sub: 'What triggers it or makes it better/worse', hint: 'after eating, when hungry, better after stool, unknown' },
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, nausea, bloating, diarrhea' },
    Q5(),
  ],
  'ท้องเสีย': [
    { header: 'Diarrhea pattern', sub: 'How many times a day and stool character', hint: '1-2 loose stools, 3-5 watery, 6-10 with mucus' },
    Q2('symptom'),
    { header: 'Triggers and context', sub: 'Did you eat anything unusual beforehand', hint: 'leftover food, unclean water, unknown, antibiotics' },
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, abdominal pain, nausea, fever' },
    Q5(),
  ],
  'ท้องผูก': [
    { header: 'Constipation pattern', sub: 'What kind of difficulty passing stool', hint: 'no stool 2-3 days, hard stool, straining, small amount' },
    Q2('symptom'),
    Q3(),
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, bloating, abdominal pain, nausea' },
    Q5(),
  ],
  'ริดสีดวงทวาร': [
    { header: 'Hemorrhoid pattern', sub: 'What symptoms do you have', hint: 'pain on defecation, slight blood, protruding lump, anal itch' },
    Q2('symptom'),
    Q3(),
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, constipation, anal pain, blood streak' },
    Q5(),
  ],
  'คลื่นไส้/อาเจียน': [
    { header: 'Nausea/vomiting pattern', sub: 'What is it like', hint: 'nausea without vomiting, occasional vomiting, frequent vomiting, vomit after eating' },
    Q2('symptom'),
    Q3(),
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, abdominal pain, dizziness, diarrhea' },
    Q5(),
  ],
  'กรดไหลย้อน': [
    { header: 'Acid reflux pattern', sub: 'How does it feel', hint: 'heartburn, sour burp, chest fullness after meals, lump in throat' },
    Q2('symptom'),
    { header: 'Triggers and context', sub: 'What triggers it or makes it better/worse', hint: 'spicy/fatty food, lying down after meals, coffee, unknown' },
    Q4(),
    Q5(),
  ],
  'ปวดประจำเดือน': [
    { header: 'Menstrual pain pattern', sub: 'What kind of pain and where', hint: 'cramping lower abdomen, pain radiating to the back, dull bilateral pain' },
    Q2('pain'),
    Q3(),
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, nausea, headache, fatigue' },
    Q5(),
  ],
  'ตกขาวผิดปกติ': [
    { header: 'Discharge pattern', sub: 'What is the discharge like', hint: 'thick white with odor, yellow itchy, clear odorless, blood-tinged' },
    Q2('symptom'),
    Q3(),
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, vaginal itch, painful urination, lower abdominal pain' },
    Q5(),
  ],
  'ผื่นคัน': [
    { header: 'Rash pattern', sub: 'What is the rash like and where', hint: 'very itchy on arms, red on trunk, clear blisters on face, hives' },
    Q2('symptom'),
    { header: 'Triggers and context', sub: 'Did you contact anything beforehand', hint: 'chemicals, food, insects, unknown' },
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, swelling, fever, difficulty breathing' },
    Q5(),
  ],
  'ผื่นแพ้': [
    { header: 'Allergic rash pattern', sub: 'What is the rash like and where', hint: 'hives all over, localized red itch, red bumps on limbs' },
    Q2('symptom'),
    { header: 'Triggers and context', sub: 'Do you suspect an allergen', hint: 'medicine, seafood, pollen, unknown' },
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, facial swelling, difficulty breathing, fever' },
    Q5(),
  ],
  'บาดแผลทั่วไป': [
    { header: 'Wound pattern', sub: 'What kind of wound and where', hint: 'small cut, bruise, laceration, puncture wound' },
    Q2('symptom'),
    { header: 'Triggers and context', sub: 'What caused it', hint: 'sharp object, fall, sports, unknown' },
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, slight bleeding, red swelling, pus' },
    Q5(),
  ],
  'แมลงสัตว์กัดต่อย': [
    { header: 'Bite/sting pattern', sub: 'What bit/stung you and how does it feel', hint: 'itchy mosquito bite, swollen bee sting, fire ant, unknown insect' },
    Q2('symptom'),
    Q3(),
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, severe swelling, fever, difficulty breathing' },
    Q5(),
  ],
  'แผลถลอก/ไหม้': [
    { header: 'Abrasion or burn pattern', sub: 'What is the wound like', hint: 'small abrasion, red burn, blister, scald' },
    Q2('symptom'),
    { header: 'Triggers and context', sub: 'What caused it', hint: 'slip/fall, hot water, hot oil, sunburn' },
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, burning pain, pus, red swelling' },
    Q5(),
  ],
  'กลาก/เกลื้อน': [
    { header: 'Ringworm/tinea pattern', sub: 'What is the rash like and where', hint: 'round red-edge patch, white spots on body, itchy skin folds' },
    Q2('symptom'),
    Q3(),
    Q4(),
    Q5(),
  ],
  'หิด/เหา': [
    { header: 'Scabies/lice pattern', sub: 'What symptoms do you have', hint: 'night itch, scratch marks, lice/nits found, scalp itch' },
    Q2('symptom'),
    { header: 'Triggers and context', sub: 'Do close contacts have similar symptoms', hint: 'household member, roommate, none, unknown' },
    Q4(),
    Q5(),
  ],
  'ฝีหนอง': [
    { header: 'Boil/abscess pattern', sub: 'What is it like and where', hint: 'red swollen with pus, painful hot lump, white-headed boil' },
    Q2('symptom'),
    Q3(),
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, fever, throbbing pain, spreading swelling' },
    Q5(),
  ],
  'แผลในปาก': [
    { header: 'Mouth ulcer pattern', sub: 'What is it like and where', hint: 'lip canker sore, inner cheek ulcer, tongue ulcer, multiple spots' },
    Q2('symptom'),
    Q3(),
    Q4(),
    Q5(),
  ],
  'ปวดฟัน': [
    { header: 'Toothache pattern', sub: 'What kind of toothache', hint: 'throbbing pain, sensitivity, pain when chewing, radiating jaw pain' },
    Q2('pain'),
    Q3(),
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, gum swelling, fever, facial swelling' },
    Q5(),
  ],
  'ตาแดง': [
    { header: 'Red eye pattern', sub: 'What is the red eye like', hint: 'whole eye red, corner red, eye discharge, itchy watery eyes' },
    Q2('symptom'),
    Q3(),
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, eye irritation, blurred vision, eye pain' },
    Q5(),
  ],
  'ตากุ้งยิง': [
    { header: 'Stye pattern', sub: 'What is it like', hint: 'red swollen eyelid, pus tip, tender to press, itchy eye' },
    Q2('symptom'),
    Q3(),
    Q4(),
    Q5(),
  ],
  'หูอักเสบ': [
    { header: 'Ear infection pattern', sub: 'What ear symptoms do you have', hint: 'ear pain, discharge, muffled ear, reduced hearing' },
    Q2('symptom'),
    Q3(),
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, fever, dizziness, pain when swallowing' },
    Q5(),
  ],
  'คัดจมูก/น้ำมูกไหล': [
    { header: 'Congestion/runny nose pattern', sub: 'What is it like', hint: 'stuffy nose, clear runny nose, thick yellow mucus, frequent sneezing' },
    Q2('symptom'),
    Q3(),
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, sore throat, fever, headache' },
    Q5(),
  ],
  'ภูมิแพ้': [
    { header: 'Allergy pattern', sub: 'What symptoms do you have', hint: 'sneezing/runny nose, itchy eyes, hives, tight breathing' },
    Q2('symptom'),
    { header: 'Triggers and context', sub: 'What triggers the allergy', hint: 'dust, pollen, food, unknown' },
    Q4(),
    Q5(),
  ],
  'นอนไม่หลับ': [
    { header: 'Insomnia pattern', sub: 'What kind of sleep problem', hint: 'hard to fall asleep, wake at night, wake too early, light sleep' },
    Q2('symptom'),
    { header: 'Triggers and context', sub: 'What do you think causes the insomnia', hint: 'stress, coffee, phone before bed, unknown' },
    Q4(),
    Q5(),
  ],
  'วิตกกังวล': [
    { header: 'Anxiety pattern', sub: 'How does the anxiety feel', hint: 'overthinking sleeplessness, palpitations, restlessness, fear without clear cause' },
    Q2('symptom'),
    Q3(),
    { header: 'Important accompanying symptoms', sub: 'Do you have any other symptoms', hint: 'none, palpitations, sweating, insomnia' },
    Q5(),
  ],
};

export const DEFAULT_BANK_EN: FixedQuestionEn[] = [
  { header: 'Main symptom pattern', sub: 'What is the main symptom like', hint: 'mild, moderate, severe, unknown' },
  Q2('symptom'),
  Q3(),
  Q4(),
  Q5(),
];

export const PHARMACY_CONSULT_CTA_EN =
  'For more advice, please contact a pharmacist on TELEBOT-PHARMACY by tapping the "Consult pharmacist" button above';

/** Fixed medical disclaimer — must appear in every summary */
export const SUMMARY_MEDICAL_DISCLAIMER_EN =
  '⚠️ This information is for preliminary guidance only and cannot replace a doctor\'s diagnosis. If symptoms do not improve, please see a doctor immediately.';

export const SEE_PHARMACIST_SECTION_TITLE_EN = '⚠️ See a pharmacist if you have these symptoms';

export const SEE_PHARMACIST_WARNING_ITEMS_EN = [
  'Symptoms worsen quickly or do not improve within 1–2 days',
  'Persistent high fever / fever over 39°C',
  'Difficulty breathing, severe shortness of breath, or chest tightness',
  'Severe pain that is hard to tolerate',
  'Concerning symptoms such as abnormal bleeding, severe dizziness, or fainting',
] as const;
