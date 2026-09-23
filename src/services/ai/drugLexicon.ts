/**
 * Small drug-name lexicon used to split a spoken run of medication names.
 *
 * Speech has no commas: "panadol paracetamol metformin twice daily" arrives as one
 * phrase. Knowing which tokens are drug names lets the parser turn it into three
 * medications instead of one medication called "Panadol Paracetamol Metformin".
 * Unknown names still work — they are simply treated as one (possibly multi-word) name.
 */

/** Single-word generic + common brand names (lower-case). Includes brands common in Pakistan / South Asia. */
const SINGLE_WORD = [
  // analgesics / NSAIDs
  'paracetamol', 'acetaminophen', 'panadol', 'calpol', 'tylenol', 'ibuprofen', 'brufen', 'advil', 'motrin', 'naproxen', 'diclofenac', 'voltaren', 'voltral', 'aspirin', 'disprin', 'ecosprin', 'loprin',
  'celecoxib', 'celebrex', 'meloxicam', 'mobic', 'ketorolac', 'toradol', 'tramadol', 'ultram', 'codeine', 'morphine', 'oxycodone', 'hydrocodone', 'fentanyl', 'mefenamic', 'ponstan', 'piroxicam', 'feldene', 'nimesulide',
  // antibiotics / antimicrobials
  'amoxicillin', 'amoxil', 'augmentin', 'ampicillin', 'penicillin', 'azithromycin', 'zithromax', 'azomax', 'clarithromycin', 'klaricid', 'erythromycin', 'ciprofloxacin', 'cipro', 'ciproxin', 'levofloxacin', 'levaquin', 'leflox', 'moxifloxacin', 'avelox',
  'doxycycline', 'vibramycin', 'tetracycline', 'minocycline', 'metronidazole', 'flagyl', 'cephalexin', 'keflex', 'cefixime', 'cefspan', 'ceftriaxone', 'rocephin', 'cefuroxime', 'zinacef', 'cefaclor', 'ceclor', 'cefadroxil', 'cefpodoxime',
  'clindamycin', 'dalacin', 'linezolid', 'zyvox', 'vancomycin', 'gentamicin', 'amikacin', 'nitrofurantoin', 'macrobid', 'trimethoprim', 'sulfamethoxazole', 'bactrim', 'septran', 'cotrimoxazole', 'rifampicin', 'rifampin', 'isoniazid', 'ethambutol', 'pyrazinamide',
  'fluconazole', 'diflucan', 'itraconazole', 'terbinafine', 'lamisil', 'nystatin', 'clotrimazole', 'canesten', 'ketoconazole', 'acyclovir', 'zovirax', 'valacyclovir', 'valtrex', 'oseltamivir', 'tamiflu', 'albendazole', 'zentel', 'mebendazole', 'ivermectin', 'chloroquine', 'hydroxychloroquine', 'plaquenil', 'artemether',
  // diabetes
  'metformin', 'glucophage', 'neodipar', 'glimepiride', 'amaryl', 'getryl', 'gliclazide', 'diamicron', 'glibenclamide', 'daonil', 'glyburide', 'glipizide', 'sitagliptin', 'januvia', 'linagliptin', 'trajenta', 'vildagliptin', 'galvus', 'empagliflozin', 'jardiance', 'dapagliflozin', 'forxiga', 'canagliflozin', 'invokana',
  'pioglitazone', 'actos', 'insulin', 'lantus', 'glargine', 'humalog', 'novorapid', 'novomix', 'mixtard', 'humulin', 'levemir', 'liraglutide', 'victoza', 'semaglutide', 'ozempic', 'rybelsus', 'dulaglutide', 'trulicity', 'acarbose',
  // cardiovascular
  'amlodipine', 'norvasc', 'nifedipine', 'adalat', 'diltiazem', 'verapamil', 'atenolol', 'tenormin', 'metoprolol', 'lopressor', 'toprol', 'bisoprolol', 'concor', 'carvedilol', 'propranolol', 'inderal', 'nebivolol', 'byscard', 'labetalol',
  'lisinopril', 'zestril', 'enalapril', 'ramipril', 'altace', 'captopril', 'perindopril', 'losartan', 'cozaar', 'valsartan', 'diovan', 'telmisartan', 'micardis', 'candesartan', 'irbesartan', 'olmesartan', 'sacubitril', 'entresto',
  'hydrochlorothiazide', 'furosemide', 'lasix', 'spironolactone', 'aldactone', 'chlorthalidone', 'indapamide', 'natrilix', 'torsemide', 'bumetanide', 'eplerenone', 'digoxin', 'lanoxin', 'amiodarone', 'cordarone', 'ivabradine',
  'atorvastatin', 'lipitor', 'lipiget', 'rosuvastatin', 'crestor', 'rovista', 'simvastatin', 'zocor', 'pravastatin', 'lovastatin', 'ezetimibe', 'zetia', 'fenofibrate', 'gemfibrozil', 'clopidogrel', 'plavix', 'lowplat', 'ticagrelor', 'brilinta', 'prasugrel',
  'warfarin', 'coumadin', 'rivaroxaban', 'xarelto', 'apixaban', 'eliquis', 'dabigatran', 'pradaxa', 'heparin', 'enoxaparin', 'clexane', 'nitroglycerin', 'isosorbide', 'angised', 'ranolazine', 'hydralazine', 'methyldopa', 'clonidine', 'doxazosin', 'prazosin', 'tamsulosin', 'flomax',
  // GI
  'omeprazole', 'risek', 'prilosec', 'losec', 'esomeprazole', 'nexum', 'nexium', 'pantoprazole', 'protonix', 'zopent', 'lansoprazole', 'prevacid', 'rabeprazole', 'famotidine', 'pepcid', 'ranitidine', 'zantac', 'cimetidine',
  'domperidone', 'motilium', 'metoclopramide', 'maxolon', 'ondansetron', 'zofran', 'dimenhydrinate', 'gravinate', 'prochlorperazine', 'loperamide', 'imodium', 'lactulose', 'duphalac', 'bisacodyl', 'dulcolax', 'senna', 'mesalamine', 'sulfasalazine', 'hyoscine', 'buscopan', 'simethicone', 'ursodiol',
  // respiratory / allergy
  'salbutamol', 'albuterol', 'ventolin', 'ipratropium', 'atrovent', 'tiotropium', 'spiriva', 'budesonide', 'pulmicort', 'fluticasone', 'flixotide', 'beclomethasone', 'montelukast', 'singulair', 'myteka', 'theophylline', 'salmeterol', 'seretide', 'formoterol', 'symbicort',
  'cetirizine', 'zyrtec', 'rigix', 'loratadine', 'claritin', 'softin', 'fexofenadine', 'allegra', 'telfast', 'desloratadine', 'levocetirizine', 'xyzal', 'chlorpheniramine', 'piriton', 'diphenhydramine', 'benadryl', 'hydroxyzine', 'atarax', 'promethazine', 'phenergan', 'dextromethorphan', 'guaifenesin', 'bromhexine', 'ambroxol', 'mucolator', 'pseudoephedrine', 'actifed',
  // endocrine / steroids
  'levothyroxine', 'thyroxine', 'synthroid', 'eltroxin', 'carbimazole', 'methimazole', 'propylthiouracil', 'prednisolone', 'prednisone', 'deltacortril', 'dexamethasone', 'decadron', 'hydrocortisone', 'methylprednisolone', 'medrol', 'betamethasone', 'fludrocortisone', 'alendronate', 'fosamax', 'calcitriol', 'cholecalciferol', 'ergocalciferol',
  // neuro / psych
  'gabapentin', 'neurontin', 'gabix', 'pregabalin', 'lyrica', 'carbamazepine', 'tegretol', 'valproate', 'depakote', 'epival', 'lamotrigine', 'lamictal', 'levetiracetam', 'keppra', 'phenytoin', 'dilantin', 'topiramate', 'topamax', 'phenobarbital', 'clonazepam', 'klonopin', 'rivotril',
  'sertraline', 'zoloft', 'fluoxetine', 'prozac', 'paroxetine', 'paxil', 'citalopram', 'celexa', 'escitalopram', 'lexapro', 'cipralex', 'venlafaxine', 'effexor', 'duloxetine', 'cymbalta', 'amitriptyline', 'elavil', 'nortriptyline', 'mirtazapine', 'remeron', 'bupropion', 'wellbutrin', 'trazodone',
  'alprazolam', 'xanax', 'diazepam', 'valium', 'lorazepam', 'ativan', 'zolpidem', 'ambien', 'melatonin', 'quetiapine', 'seroquel', 'olanzapine', 'zyprexa', 'risperidone', 'risperdal', 'aripiprazole', 'abilify', 'haloperidol', 'haldol', 'lithium', 'methylphenidate', 'ritalin', 'atomoxetine', 'donepezil', 'aricept', 'memantine', 'levodopa', 'sinemet', 'sumatriptan', 'imitrex', 'rizatriptan', 'propranolol', 'flunarizine', 'betahistine', 'serc',
  // musculoskeletal / others
  'allopurinol', 'zyloric', 'febuxostat', 'colchicine', 'methotrexate', 'leflunomide', 'baclofen', 'tizanidine', 'cyclobenzaprine', 'orphenadrine', 'thiocolchicoside', 'glucosamine', 'sildenafil', 'viagra', 'tadalafil', 'cialis', 'finasteride', 'oxybutynin', 'solifenacin', 'mirabegron',
  // vitamins / supplements
  'multivitamin', 'folic', 'ferrous', 'iron', 'calcium', 'magnesium', 'zinc', 'biotin', 'thiamine', 'pyridoxine', 'cyanocobalamin', 'mecobalamin', 'methylcobalamin', 'ascorbic', 'surbex', 'neurobion', 'centrum', 'caltrate', 'osnate', 'qalsan', 'sangobion', 'fefol', 'evion', 'indrop',
  // OTC / misc
  'ors', 'nicotine', 'varenicline', 'naloxone', 'naltrexone', 'buprenorphine', 'methadone', 'epinephrine', 'adrenaline', 'atropine', 'lidocaine', 'xylocaine', 'benzocaine', 'chlorhexidine', 'povidone', 'betadine', 'mupirocin', 'bactroban', 'fusidic', 'fucidin', 'polyfax', 'tretinoin', 'adapalene', 'isotretinoin', 'benzoyl', 'permethrin', 'lotrix', 'minoxidil',
];

/** Multi-word names and combination products, longest first when matched. */
const MULTI_WORD = [
  'amoxicillin clavulanate', 'amoxicillin and clavulanate', 'amoxicillin clavulanic acid', 'co amoxiclav', 'co-amoxiclav', 'clavulanic acid',
  'trimethoprim sulfamethoxazole', 'sulfamethoxazole trimethoprim', 'trimethoprim and sulfamethoxazole', 'sulfamethoxazole and trimethoprim',
  'hydrocodone acetaminophen', 'hydrocodone and acetaminophen', 'oxycodone acetaminophen', 'oxycodone and acetaminophen', 'codeine and paracetamol', 'paracetamol and codeine', 'paracetamol codeine',
  'ipratropium albuterol', 'ipratropium and albuterol', 'ipratropium salbutamol', 'ipratropium and salbutamol', 'sacubitril valsartan', 'sacubitril and valsartan', 'ezetimibe simvastatin', 'ezetimibe and simvastatin',
  'metformin sitagliptin', 'metformin and sitagliptin', 'sitagliptin metformin', 'sitagliptin and metformin', 'metformin glimepiride', 'metformin and glimepiride', 'glimepiride and metformin', 'metformin empagliflozin', 'empagliflozin and metformin',
  'losartan hydrochlorothiazide', 'losartan and hydrochlorothiazide', 'lisinopril hydrochlorothiazide', 'lisinopril and hydrochlorothiazide', 'valsartan hydrochlorothiazide', 'valsartan and hydrochlorothiazide', 'amlodipine valsartan', 'amlodipine and valsartan', 'amlodipine atorvastatin', 'amlodipine and atorvastatin', 'amlodipine benazepril', 'amlodipine and benazepril',
  'budesonide formoterol', 'budesonide and formoterol', 'fluticasone salmeterol', 'fluticasone and salmeterol', 'salmeterol fluticasone',
  'ferrous sulfate', 'ferrous sulphate', 'ferrous fumarate', 'ferrous gluconate', 'folic acid', 'ascorbic acid', 'valproic acid', 'mefenamic acid', 'fusidic acid', 'acetylsalicylic acid', 'tranexamic acid',
  'vitamin d', 'vitamin d3', 'vitamin c', 'vitamin b', 'vitamin b1', 'vitamin b6', 'vitamin b12', 'vitamin e', 'vitamin a', 'vitamin k', 'calcium carbonate', 'calcium citrate', 'magnesium sulfate', 'magnesium oxide', 'zinc sulfate', 'potassium chloride', 'sodium bicarbonate', 'sodium valproate', 'omega 3', 'fish oil', 'cod liver oil',
  'insulin glargine', 'insulin lispro', 'insulin aspart', 'insulin regular', 'insulin nph', 'insulin detemir', 'insulin degludec', 'oral rehydration salts', 'oral rehydration solution', 'benzoyl peroxide', 'hyoscine butylbromide', 'glyceryl trinitrate', 'isosorbide mononitrate', 'isosorbide dinitrate', 'methyl salicylate',
  'panadol extra', 'panadol cf', 'panadol cold and flu', 'panadol night', 'brufen forte', 'brufen plus', 'augmentin duo', 'flagyl forte', 'risek insta', 'nexum ec', 'seretide evohaler', 'neurobion forte', 'surbex z', 'calpol 6 plus', 'ventolin evohaler',
];

/**
 * Words that continue the previous medication name rather than start a new one:
 * strengths, formulations and brand suffixes ("panadol extra", "brufen syrup", "nexum ec").
 */
const NAME_SUFFIX = new Set([
  'extra', 'forte', 'plus', 'max', 'ultra', 'advance', 'xr', 'sr', 'er', 'cr', 'la', 'xl', 'ds', 'ec', 'mr', 'od', 'retard', 'depot', 'junior', 'pediatric', 'paediatric', 'kids', 'adult', 'infant', 'insta', 'duo', 'night', 'day', 'sinus', 'cold', 'flu', 'cf',
  'tablet', 'tablets', 'tab', 'tabs', 'capsule', 'capsules', 'cap', 'caps', 'syrup', 'suspension', 'susp', 'drops', 'drop', 'cream', 'ointment', 'gel', 'lotion', 'spray', 'inhaler', 'evohaler', 'nebule', 'nebules', 'injection', 'inj', 'patch', 'sachet', 'sachets', 'solution', 'powder', 'lozenge', 'lozenges', 'suppository', 'pen',
  'acid', 'sulfate', 'sulphate', 'chloride', 'carbonate', 'citrate', 'sodium', 'potassium', 'hydrochloride', 'hcl', 'maleate', 'succinate', 'tartrate', 'mesylate', 'besylate', 'fumarate', 'gluconate', 'phosphate', 'acetate', 'nitrate', 'mononitrate', 'dinitrate', 'oxide', 'peroxide', 'butylbromide', 'trinitrate', 'salicylate',
  'and', '&', 'with',
]);

const KNOWN_SINGLE = new Set(SINGLE_WORD);
const KNOWN_MULTI = MULTI_WORD.map((n) => n.toLowerCase().split(/\s+/)).sort((a, b) => b.length - a.length);

const AND_COMBOS = MULTI_WORD.filter((n) => n.includes(' and ')).map((n) => ({ re: new RegExp(`\\b${n.replace(' and ', ' (?:and|aur) ')}\\b`, 'g'), joined: n.replace(' and ', '/') }));

/**
 * Rewrite spoken combination products so a later "and" split cannot break them apart:
 * "amoxicillin and clavulanate 500 mg" -> "amoxicillin/clavulanate 500 mg".
 */
export function protectCombinations(text: string): string {
  let out = text;
  for (const combo of AND_COMBOS) out = out.replace(combo.re, combo.joined);
  return out;
}

/** True when the word is a known drug name (single-word entries only). */
export const isKnownDrug = (word: string): boolean => KNOWN_SINGLE.has(word.toLowerCase());

/**
 * Split the name part of a spoken medication phrase into individual medication names.
 *
 *   "panadol paracetamol metformin"   -> ["panadol", "paracetamol", "metformin"]
 *   "panadol extra and brufen"        -> ["panadol extra", "brufen"]
 *   "amoxicillin and clavulanate"     -> ["amoxicillin and clavulanate"]     (combination product)
 *   "vitamin d"                       -> ["vitamin d"]
 *   "some unknown drug"               -> ["some unknown drug"]               (nothing recognised → one name)
 *
 * Rules, in order: explicit separators (comma / "and" / "aur") always split unless they form a
 * known combination product; within a segment, a run of words is split wherever a known drug name starts,
 * with formulation/suffix words attached to the preceding name. A segment with no recognised drug name
 * is returned whole so unusual names are never chopped up.
 */
export function splitMedicationNames(namePart: string): string[] {
  const cleaned = namePart.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const segments = cleaned.split(/\s*(?:,|;|\baur\b)\s*|\s+and\s+/).map((s) => s.trim()).filter(Boolean);
  // Re-join segments that a separator wrongly split ("amoxicillin and clavulanate").
  const merged: string[] = [];
  for (const seg of segments) {
    const prev = merged[merged.length - 1];
    if (prev && isKnownMultiWord(`${prev} and ${seg}`)) merged[merged.length - 1] = `${prev} and ${seg}`;
    else merged.push(seg);
  }
  return merged.flatMap(splitSegment);
}

function isKnownMultiWord(phrase: string): boolean {
  const words = phrase.split(' ');
  return KNOWN_MULTI.some((m) => m.length === words.length && m.every((w, i) => w === words[i]));
}

function splitSegment(segment: string): string[] {
  const words = segment.split(' ');
  const names: string[][] = [];
  let i = 0;
  let recognised = false;
  while (i < words.length) {
    const multi = KNOWN_MULTI.find((m) => m.every((w, k) => words[i + k] === w));
    if (multi) {
      names.push([...multi]);
      i += multi.length;
      recognised = true;
      continue;
    }
    const word = words[i];
    const current = names[names.length - 1];
    if (KNOWN_SINGLE.has(word)) {
      names.push([word]);
      recognised = true;
    } else if (current && (NAME_SUFFIX.has(word) || !KNOWN_SINGLE.has(current[current.length - 1]))) {
      // Suffix words, or the continuation of an unrecognised multi-word name, stay with the current name.
      current.push(word);
    } else {
      names.push([word]);
    }
    i++;
  }
  if (!recognised) return [segment];
  return names.map((n) => n.join(' ')).filter(Boolean);
}
