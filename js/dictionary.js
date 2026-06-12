/* Built-in DE→EN grocery dictionary. Keys are NORMALISED tokens
 * (lowercase, transliterated: ä→ae, ö→oe, ü→ue, ß→ss) so lookups work
 * directly on tokenize() output. Used to SUGGEST English canonical
 * product names during the correction step — the user always confirms.
 * Unknown tokens pass through unchanged. */

import { normalizeName, tokenize } from './normalize.js';

export const DE_EN = {
  // fruit
  apfel: 'apple', aepfel: 'apples', banane: 'banana', bananen: 'bananas',
  birne: 'pear', birnen: 'pears', traube: 'grape', trauben: 'grapes',
  weintrauben: 'grapes', erdbeere: 'strawberry', erdbeeren: 'strawberries',
  himbeere: 'raspberry', himbeeren: 'raspberries', heidelbeere: 'blueberry',
  heidelbeeren: 'blueberries', heidelb: 'blueberries', blaubeeren: 'blueberries',
  brombeeren: 'blackberries', johannisbeeren: 'currants', kirsche: 'cherry',
  kirschen: 'cherries', pfirsich: 'peach', pfirsiche: 'peaches',
  nektarine: 'nectarine', aprikose: 'apricot', aprikosen: 'apricots',
  pflaume: 'plum', pflaumen: 'plums', zwetschgen: 'plums',
  zitrone: 'lemon', zitronen: 'lemons', limette: 'lime', limetten: 'limes',
  orange: 'orange', orangen: 'oranges', apfelsine: 'orange',
  clementine: 'clementine', clementinen: 'clementines', clement: 'clementines',
  mandarine: 'mandarin', mandarinen: 'mandarins', mand: 'mandarins',
  ananas: 'pineapple', mango: 'mango', melone: 'melon', wassermelone: 'watermelon',
  kiwi: 'kiwi', granatapfel: 'pomegranate', feige: 'fig', feigen: 'figs',
  dattel: 'date', datteln: 'dates', rosinen: 'raisins', beeren: 'berries',
  beerenmischung: 'berry mix', obst: 'fruit', avocado: 'avocado',

  // vegetables
  gemuese: 'vegetables', kartoffel: 'potato', kartoffeln: 'potatoes',
  suesskartoffel: 'sweet potato', tomate: 'tomato', tomaten: 'tomatoes',
  gurke: 'cucumber', gurken: 'cucumbers', salatgurke: 'cucumber',
  paprika: 'bell pepper', zucchini: 'courgette', aubergine: 'aubergine',
  moehre: 'carrot', moehren: 'carrots', karotte: 'carrot', karotten: 'carrots',
  zwiebel: 'onion', zwiebeln: 'onions', lauchzwiebeln: 'spring onions',
  fruehlingszwiebeln: 'spring onions', knoblauch: 'garlic', lauch: 'leek',
  porree: 'leek', sellerie: 'celery', spinat: 'spinach', salat: 'lettuce',
  eisbergsalat: 'iceberg lettuce', kopfsalat: 'lettuce', rucola: 'rocket',
  feldsalat: 'lamb’s lettuce', brokkoli: 'broccoli', blumenkohl: 'cauliflower',
  rosenkohl: 'brussels sprouts', kohl: 'cabbage', weisskohl: 'white cabbage',
  rotkohl: 'red cabbage', wirsing: 'savoy cabbage', gruenkohl: 'kale',
  kuerbis: 'pumpkin', spargel: 'asparagus', erbsen: 'peas', bohnen: 'beans',
  kidneybohnen: 'kidney beans', kichererbsen: 'chickpeas', linsen: 'lentils',
  mais: 'corn', pilze: 'mushrooms', champignons: 'mushrooms',
  radieschen: 'radishes', rettich: 'radish', rote: 'red', bete: 'beet',
  ingwer: 'ginger', kraeuter: 'herbs', petersilie: 'parsley',
  basilikum: 'basil', schnittlauch: 'chives', dill: 'dill',
  sauerkraut: 'sauerkraut', jalapeno: 'jalapeno', chili: 'chilli',

  // bakery
  brot: 'bread', broetchen: 'bread roll', brezel: 'pretzel', baguette: 'baguette',
  toast: 'toast', toastbrot: 'toast bread', vollkorn: 'wholegrain',
  vollkornbrot: 'wholegrain bread', roggen: 'rye', roggenbrot: 'rye bread',
  rogg: 'rye', kernbrot: 'seeded bread', koernerbrot: 'seeded bread',
  dinkel: 'spelt', weizen: 'wheat', hefe: 'yeast', sesamring: 'sesame ring',
  simit: 'simit', croissant: 'croissant', kuchen: 'cake', torte: 'cake',
  keks: 'biscuit', kekse: 'biscuits', waffeln: 'waffles', zwieback: 'rusk',
  knaeckebrot: 'crispbread', backwaren: 'baked goods',

  // dairy & eggs
  milch: 'milk', vollmilch: 'whole milk', frischmilch: 'fresh milk',
  haltbare: 'long-life', laktosefrei: 'lactose-free', laktosefr: 'lactose-free',
  butter: 'butter', irische: 'irish', margarine: 'margarine',
  sahne: 'cream', schlagsahne: 'whipping cream', saure: 'sour',
  schmand: 'sour cream', quark: 'quark', joghurt: 'yoghurt', jogh: 'yoghurt',
  kaese: 'cheese', gouda: 'gouda', emmentaler: 'emmental',
  frischkaese: 'cream cheese', mozzarella: 'mozzarella', feta: 'feta',
  parmesan: 'parmesan', ei: 'egg', eier: 'eggs', freiland: 'free-range',
  bodenhaltung: 'barn eggs', molkerei: 'dairy', molk: 'dairy',
  proteinmousse: 'protein mousse', pudding: 'pudding', hafermilch: 'oat milk',
  sojamilch: 'soy milk', mandelmilch: 'almond milk',

  // meat & fish
  fleisch: 'meat', hackfleisch: 'minced meat', hack: 'mince',
  rind: 'beef', rindfleisch: 'beef', schwein: 'pork', schweinefleisch: 'pork',
  haehnchen: 'chicken', haehnchenbrust: 'chicken breast', huhn: 'chicken',
  pute: 'turkey', putenbrust: 'turkey breast', lamm: 'lamb',
  wurst: 'sausage', wuerstchen: 'sausages', bratwurst: 'bratwurst',
  knacker: 'knacker sausage', salami: 'salami', schinken: 'ham',
  speck: 'bacon', leberwurst: 'liver sausage', aufschnitt: 'cold cuts',
  fisch: 'fish', lachs: 'salmon', thunfisch: 'tuna', forelle: 'trout',
  hering: 'herring', sardine: 'sardine', sardinen: 'sardines', sardi: 'sardines',
  garnelen: 'prawns', meeresfruechte: 'seafood', fischstaebchen: 'fish fingers',

  // pantry / canned
  oel: 'oil', olivenoel: 'olive oil', sonnenblumenoel: 'sunflower oil',
  rapsoel: 'rapeseed oil', ohg: 'without head and gut', essig: 'vinegar',
  mehl: 'flour', zucker: 'sugar', salz: 'salt', pfeffer: 'pepper',
  reis: 'rice', nudeln: 'pasta', spaghetti: 'spaghetti', spätzle: 'spaetzle',
  haferflocken: 'oats', muesli: 'muesli', cornflakes: 'cornflakes',
  honig: 'honey', marmelade: 'jam', konfituere: 'jam',
  nussnougatcreme: 'chocolate spread', erdnussbutter: 'peanut butter',
  dose: 'can', dosen: 'canned', konserve: 'canned', suppe: 'soup',
  bruehe: 'broth', sauce: 'sauce', sosse: 'sauce', senf: 'mustard',
  ketchup: 'ketchup', mayonnaise: 'mayonnaise', gewuerz: 'spice',
  gewuerze: 'spices', backpulver: 'baking powder', vanillezucker: 'vanilla sugar',
  hefeflocken: 'nutritional yeast', tortillas: 'tortillas',

  // drinks
  wasser: 'water', mineralwasser: 'mineral water', sprudel: 'sparkling water',
  saft: 'juice', apfelsaft: 'apple juice', orangensaft: 'orange juice',
  trinkm: 'drink', limonade: 'lemonade', cola: 'cola', bier: 'beer',
  wein: 'wine', rotwein: 'red wine', weisswein: 'white wine', sekt: 'sparkling wine',
  kaffee: 'coffee', tee: 'tea', kakao: 'cocoa', trinkmilch: 'drinking milk',
  pfand: 'deposit', smoothie: 'smoothie', energydrink: 'energy drink',

  // snacks & sweets
  schokolade: 'chocolate', schoko: 'chocolate', edelbitter: 'dark chocolate',
  zartbitter: 'dark chocolate', vollmilchschokolade: 'milk chocolate',
  bonbons: 'sweets', gummibaerchen: 'gummy bears', chips: 'crisps',
  salzstangen: 'pretzel sticks', nuesse: 'nuts', erdnuesse: 'peanuts',
  mandeln: 'almonds', walnuesse: 'walnuts', cashewkerne: 'cashews',
  haselnuesse: 'hazelnuts', studentenfutter: 'trail mix', riegel: 'bar',
  muesliriegel: 'muesli bar', eis: 'ice cream', kaugummi: 'chewing gum',

  // frozen & ready meals
  tiefkuehl: 'frozen', tk: 'frozen', pizza: 'pizza', pommes: 'fries',
  fertiggericht: 'ready meal', lasagne: 'lasagne',

  // descriptors
  bio: 'organic', frisch: 'fresh', frischer: 'fresh', gross: 'large',
  klein: 'small', neu: 'new', stueck: 'piece', stk: 'pcs',
  packung: 'pack', beutel: 'bag', glas: 'jar', flasche: 'bottle',
  becher: 'cup', riegelchen: 'small bar', natur: 'natural', nat: 'natural',
  gesalzen: 'salted', ungesalzen: 'unsalted', gerieben: 'grated',
  geraeuchert: 'smoked', getrocknet: 'dried', gekuehlt: 'chilled',
  banderole: 'banded', kult: 'cult', pfl: 'plant',
};

/* Suggest an English name for a (possibly German) receipt name.
 * Word-by-word: known tokens are translated, unknown tokens kept as-is.
 * Returns null when nothing was translated (i.e. the name is probably
 * already English) so callers can skip the suggestion. */
export function suggestEnglishName(rawName) {
  const norm = normalizeName(rawName);
  if (!norm) return null;
  let translated = 0;
  const words = norm.split(' ').map((w) => {
    const hit = DE_EN[w];
    if (hit) { translated++; return hit; }
    return w;
  });
  if (translated === 0) return null;
  return words.join(' ');
}

/* English translations of a name's tokens, for the product token index —
 * lets a search for "milk" find a product saved as "Vollmilch". */
export function translateTokens(rawName) {
  const out = new Set();
  for (const t of tokenize(rawName)) {
    const hit = DE_EN[t];
    if (hit) {
      for (const w of hit.split(' ')) {
        if (w.length >= 2) out.add(w);
      }
    }
  }
  return [...out];
}
