/**
 * Dati demo per `npm run db:seed`. Separati dalla logica di inserimento (`seed.ts`)
 * per essere facili da leggere, estendere o sostituire.
 */

export interface CollectionSeed {
  slug: string
  title: string
  description: string
  imageUrl: string
  position: number
}

export interface ProductOptionSeed {
  /** Nome dell'asse, es. "Taglia", "Colore", "Formato". */
  name: string
  values: string[]
}

export interface VariantSeed {
  sku: string
  /**
   * Valore scelto per ciascun asse, nello stesso ordine di `ProductSeed.options`.
   * Array vuoto per prodotti senza opzioni (variante unica "Default").
   */
  selection: string[]
  stock: number
  /** Sovrascrive `priceCents` del prodotto solo se il prezzo varia per variante. */
  priceCents?: number
}

export interface ProductSeed {
  slug: string
  title: string
  excerpt: string
  /** HTML semplice: <p> e <ul>. */
  description: string
  status: 'active' | 'draft'
  priceCents: number
  /** Valorizzato solo sui prodotti che devono mostrare il prezzo barrato. */
  compareAtCents?: number
  /** Quante immagini generare (picsum.photos, deterministiche per slug). */
  imageCount: number
  options: ProductOptionSeed[]
  variants: VariantSeed[]
  collectionSlugs: string[]
}

export const collectionsSeed: CollectionSeed[] = [
  {
    slug: 'abbigliamento',
    title: 'Abbigliamento',
    description: 'Capi essenziali e senza tempo, pensati per l\'uso quotidiano.',
    imageUrl: 'https://picsum.photos/seed/coll-abbigliamento/1200/600',
    position: 0,
  },
  {
    slug: 'accessori',
    title: 'Accessori',
    description: 'Dettagli in pelle e piccoli oggetti che completano ogni outfit.',
    imageUrl: 'https://picsum.photos/seed/coll-accessori/1200/600',
    position: 1,
  },
  {
    slug: 'casa',
    title: 'Casa',
    description: 'Oggetti per arredare e profumare gli ambienti di casa.',
    imageUrl: 'https://picsum.photos/seed/coll-casa/1200/600',
    position: 2,
  },
  {
    slug: 'novita',
    title: 'Novità',
    description: 'Gli ultimi arrivi selezionati dal nostro team.',
    imageUrl: 'https://picsum.photos/seed/coll-novita/1200/600',
    position: 3,
  },
]

export const productsSeed: ProductSeed[] = [
  // ---------------------------------------------------------------- Abbigliamento
  {
    slug: 'maglietta-basic-cotone',
    title: 'Maglietta Basic Cotone',
    excerpt: 'T-shirt girocollo in cotone pettinato, la base perfetta per ogni giorno.',
    description:
      "<p>La Maglietta Basic Cotone è pensata per chi cerca qualità senza rinunciare alla semplicità. Realizzata in cotone pettinato 100%, garantisce una vestibilità regolare e una mano morbida che non perde forma dopo i lavaggi.</p>" +
      '<p>Il girocollo rinforzato e le cuciture piatte la rendono comoda da indossare tutto il giorno, da sola o come base per outfit più elaborati.</p>' +
      '<ul><li>Cotone pettinato 100%, 180 g/m²</li><li>Girocollo rinforzato anti-deformazione</li><li>Disponibile in tre colori e quattro taglie</li></ul>',
    status: 'active',
    priceCents: 1900,
    imageCount: 4,
    options: [
      { name: 'Taglia', values: ['S', 'M', 'L', 'XL'] },
      { name: 'Colore', values: ['Bianco', 'Nero', 'Blu'] },
    ],
    variants: [
      { sku: 'TSH-BIA-S', selection: ['S', 'Bianco'], stock: 20 },
      { sku: 'TSH-NER-S', selection: ['S', 'Nero'], stock: 0 },
      { sku: 'TSH-BLU-S', selection: ['S', 'Blu'], stock: 15 },
      { sku: 'TSH-BIA-M', selection: ['M', 'Bianco'], stock: 35 },
      { sku: 'TSH-NER-M', selection: ['M', 'Nero'], stock: 12 },
      { sku: 'TSH-BLU-M', selection: ['M', 'Blu'], stock: 3 },
      { sku: 'TSH-BIA-L', selection: ['L', 'Bianco'], stock: 18 },
      { sku: 'TSH-NER-L', selection: ['L', 'Nero'], stock: 25 },
      { sku: 'TSH-BLU-L', selection: ['L', 'Blu'], stock: 0 },
      { sku: 'TSH-BIA-XL', selection: ['XL', 'Bianco'], stock: 10 },
      { sku: 'TSH-NER-XL', selection: ['XL', 'Nero'], stock: 40 },
      { sku: 'TSH-BLU-XL', selection: ['XL', 'Blu'], stock: 2 },
    ],
    collectionSlugs: ['abbigliamento'],
  },
  {
    slug: 'felpa-girocollo-unisex',
    title: 'Felpa Girocollo Unisex',
    excerpt: 'Felpa in cotone garzato, calda e versatile, per la stagione fredda.',
    description:
      '<p>La Felpa Girocollo Unisex unisce comfort e stile essenziale. Il tessuto garzato all\'interno trattiene il calore senza appesantire, mentre il taglio unisex si adatta a ogni corporatura.</p>' +
      '<p>Polsini e fondo in costina elasticizzata mantengono la forma nel tempo, anche dopo lavaggi frequenti.</p>' +
      '<ul><li>Cotone garzato 320 g/m²</li><li>Polsini e fondo in costina elasticizzata</li><li>Vestibilità unisex regolare</li></ul>',
    status: 'active',
    priceCents: 4900,
    compareAtCents: 5900,
    imageCount: 3,
    options: [
      { name: 'Taglia', values: ['S', 'M', 'L', 'XL'] },
      { name: 'Colore', values: ['Grigio', 'Nero'] },
    ],
    variants: [
      { sku: 'FEL-GRI-S', selection: ['S', 'Grigio'], stock: 14 },
      { sku: 'FEL-NER-S', selection: ['S', 'Nero'], stock: 0 },
      { sku: 'FEL-GRI-M', selection: ['M', 'Grigio'], stock: 22 },
      { sku: 'FEL-NER-M', selection: ['M', 'Nero'], stock: 30 },
      { sku: 'FEL-GRI-L', selection: ['L', 'Grigio'], stock: 3 },
      { sku: 'FEL-NER-L', selection: ['L', 'Nero'], stock: 16 },
      { sku: 'FEL-GRI-XL', selection: ['XL', 'Grigio'], stock: 45 },
      { sku: 'FEL-NER-XL', selection: ['XL', 'Nero'], stock: 11 },
    ],
    collectionSlugs: ['abbigliamento'],
  },
  {
    slug: 'camicia-oxford-slim-fit',
    title: 'Camicia Oxford Slim Fit',
    excerpt: 'Camicia in tessuto Oxford, taglio slim, per look formali e casual.',
    description:
      "<p>La Camicia Oxford Slim Fit è un capo versatile che accompagna sia l'ufficio sia il tempo libero. Il tessuto Oxford, robusto e traspirante, garantisce una lunga durata mantenendo un aspetto sempre curato.</p>" +
      '<p>Il taglio slim valorizza la figura senza risultare stretto, e il colletto button-down permette di indossarla anche senza cravatta.</p>' +
      '<ul><li>100% cotone Oxford</li><li>Colletto button-down</li><li>Taglio slim fit</li></ul>',
    status: 'active',
    priceCents: 5900,
    imageCount: 3,
    options: [
      { name: 'Taglia', values: ['S', 'M', 'L', 'XL'] },
      { name: 'Colore', values: ['Bianco', 'Azzurro'] },
    ],
    variants: [
      { sku: 'CAM-BIA-S', selection: ['S', 'Bianco'], stock: 25 },
      { sku: 'CAM-AZZ-S', selection: ['S', 'Azzurro'], stock: 18 },
      { sku: 'CAM-BIA-M', selection: ['M', 'Bianco'], stock: 2 },
      { sku: 'CAM-AZZ-M', selection: ['M', 'Azzurro'], stock: 33 },
      { sku: 'CAM-BIA-L', selection: ['L', 'Bianco'], stock: 40 },
      { sku: 'CAM-AZZ-L', selection: ['L', 'Azzurro'], stock: 0 },
      { sku: 'CAM-BIA-XL', selection: ['XL', 'Bianco'], stock: 12 },
      { sku: 'CAM-AZZ-XL', selection: ['XL', 'Azzurro'], stock: 20 },
    ],
    collectionSlugs: ['abbigliamento'],
  },
  {
    slug: 'jeans-slim-denim',
    title: 'Jeans Slim Denim',
    excerpt: 'Jeans slim in denim elasticizzato, comodi e resistenti.',
    description:
      "<p>I Jeans Slim Denim combinano l'aspetto classico del denim con l'elasticità di una piccola percentuale di elastan, per una vestibilità che si muove con te senza perdere la linea slim.</p>" +
      '<p>Il lavaggio medio e i dettagli essenziali li rendono facili da abbinare, dal casual quotidiano a outfit più curati.</p>' +
      '<ul><li>Denim 98% cotone, 2% elastan</li><li>Vestibilità slim a 5 tasche</li><li>Lavaggio medio</li></ul>',
    status: 'active',
    priceCents: 6900,
    compareAtCents: 8900,
    imageCount: 4,
    options: [
      { name: 'Taglia', values: ['S', 'M', 'L', 'XL'] },
      { name: 'Colore', values: ['Blu', 'Nero'] },
    ],
    variants: [
      { sku: 'JNS-BLU-S', selection: ['S', 'Blu'], stock: 30 },
      { sku: 'JNS-NER-S', selection: ['S', 'Nero'], stock: 15 },
      { sku: 'JNS-BLU-M', selection: ['M', 'Blu'], stock: 0 },
      { sku: 'JNS-NER-M', selection: ['M', 'Nero'], stock: 22 },
      { sku: 'JNS-BLU-L', selection: ['L', 'Blu'], stock: 3 },
      { sku: 'JNS-NER-L', selection: ['L', 'Nero'], stock: 18 },
      { sku: 'JNS-BLU-XL', selection: ['XL', 'Blu'], stock: 27 },
      { sku: 'JNS-NER-XL', selection: ['XL', 'Nero'], stock: 10 },
    ],
    collectionSlugs: ['abbigliamento'],
  },
  {
    slug: 'giacca-pelle-eco-premium',
    title: 'Giacca in Pelle Eco Premium',
    excerpt: 'Giacca biker in pelle eco, il capo statement della stagione.',
    description:
      '<p>La Giacca in Pelle Eco Premium è pensata per chi cerca un capo dal forte carattere. La pelle ecologica riproduce fedelmente la texture e la resistenza della pelle naturale, con un impatto più sostenibile.</p>' +
      '<p>Fodera interna in raso e zip metalliche completano un capo curato nei dettagli, perfetto come statement piece per la mezza stagione.</p>' +
      '<ul><li>Pelle eco al 100%, cruelty-free</li><li>Fodera interna in raso</li><li>Zip metalliche anticate</li></ul>',
    status: 'active',
    priceCents: 17900,
    compareAtCents: 19900,
    imageCount: 3,
    options: [{ name: 'Taglia', values: ['S', 'M', 'L', 'XL'] }],
    variants: [
      { sku: 'GIA-S', selection: ['S'], stock: 12 },
      { sku: 'GIA-M', selection: ['M'], stock: 0 },
      { sku: 'GIA-L', selection: ['L'], stock: 3 },
      { sku: 'GIA-XL', selection: ['XL'], stock: 20 },
    ],
    collectionSlugs: ['abbigliamento', 'novita'],
  },
  {
    slug: 'vestito-midi-estivo',
    title: 'Vestito Midi Estivo',
    excerpt: "Vestito midi in viscosa fluida, leggero e fresco per l'estate.",
    description:
      '<p>Il Vestito Midi Estivo è realizzato in viscosa fluida che asseconda il movimento e resta fresca anche nelle giornate più calde. La stampa a fantasia botanica e il girovita a fascia disegnano una silhouette femminile senza rinunciare al comfort.</p>' +
      '<p>Perfetto dal mattino alla sera, si abbina facilmente a sandali bassi o décolleté per look più formali.</p>' +
      '<ul><li>Viscosa fluida 100%</li><li>Girovita a fascia elasticizzata</li><li>Lunghezza midi</li></ul>',
    status: 'active',
    priceCents: 7900,
    imageCount: 3,
    options: [{ name: 'Taglia', values: ['S', 'M', 'L'] }],
    variants: [
      { sku: 'VES-S', selection: ['S'], stock: 16 },
      { sku: 'VES-M', selection: ['M'], stock: 2 },
      { sku: 'VES-L', selection: ['L'], stock: 24 },
    ],
    collectionSlugs: ['abbigliamento', 'novita'],
  },
  // ---------------------------------------------------------------- Accessori
  {
    slug: 'cintura-pelle-artigianale',
    title: 'Cintura in Pelle Artigianale',
    excerpt: 'Cintura in vera pelle conciata al vegetale, lavorazione artigianale italiana.',
    description:
      "<p>Ogni Cintura in Pelle Artigianale nasce da un processo di conciatura al vegetale che rispetta i tempi naturali della materia prima, con il risultato di una pelle che si patina nel tempo acquisendo carattere.</p>" +
      '<p>La fibbia in metallo satinato completa un accessorio pensato per durare, adatto sia a look formali sia casual.</p>' +
      '<ul><li>Vera pelle conciata al vegetale</li><li>Fibbia in metallo satinato</li><li>Lavorazione artigianale italiana</li></ul>',
    status: 'active',
    priceCents: 3900,
    imageCount: 2,
    options: [{ name: 'Colore', values: ['Nero', 'Cognac'] }],
    variants: [
      { sku: 'CIN-NER', selection: ['Nero'], stock: 30 },
      { sku: 'CIN-COG', selection: ['Cognac'], stock: 0 },
    ],
    collectionSlugs: ['accessori'],
  },
  {
    slug: 'borsa-tote-canvas',
    title: 'Borsa Tote in Canvas',
    excerpt: "Borsa tote in canvas resistente, capiente per l'uso quotidiano.",
    description:
      "<p>La Borsa Tote in Canvas è la risposta pratica a chi ha bisogno di spazio senza rinunciare all'essenzialità. Il tessuto in canvas pesante resiste all'usura quotidiana e si mantiene in forma anche a borsa piena.</p>" +
      '<p>I manici rinforzati e la tasca interna con zip la rendono pratica per lavoro, spesa o viaggi brevi.</p>' +
      '<ul><li>Canvas 100% cotone, 400 g/m²</li><li>Manici rinforzati con doppia cucitura</li><li>Tasca interna con zip</li></ul>',
    status: 'active',
    priceCents: 2900,
    imageCount: 3,
    options: [],
    variants: [{ sku: 'BOR-DEFAULT', selection: [], stock: 45 }],
    collectionSlugs: ['accessori'],
  },
  {
    slug: 'cappello-baseball-ricamato',
    title: 'Cappello da Baseball Ricamato',
    excerpt: 'Cappello baseball in cotone con ricamo frontale, chiusura regolabile.',
    description:
      '<p>Il Cappello da Baseball Ricamato aggiunge un dettaglio distintivo a ogni outfit casual. Il ricamo frontale a tono è realizzato con filati resistenti che non perdono colore nel tempo.</p>' +
      '<p>La chiusura posteriore regolabile garantisce una vestibilità su misura per ogni testa.</p>' +
      '<ul><li>Cotone 100%</li><li>Ricamo frontale a tono</li><li>Chiusura posteriore regolabile</li></ul>',
    status: 'active',
    priceCents: 1900,
    imageCount: 2,
    options: [{ name: 'Colore', values: ['Nero', 'Beige', 'Blu'] }],
    variants: [
      { sku: 'CAP-NER', selection: ['Nero'], stock: 20 },
      { sku: 'CAP-BEI', selection: ['Beige'], stock: 3 },
      { sku: 'CAP-BLU', selection: ['Blu'], stock: 0 },
    ],
    collectionSlugs: ['accessori'],
  },
  {
    slug: 'occhiali-sole-polarizzati',
    title: 'Occhiali da Sole Polarizzati',
    excerpt: 'Occhiali da sole con lenti polarizzate e protezione UV400.',
    description:
      '<p>Gli Occhiali da Sole Polarizzati offrono una protezione UV400 completa insieme a lenti polarizzate che riducono i riflessi su asfalto, acqua e neve, per una visione più nitida in ogni condizione di luce.</p>' +
      '<p>La montatura leggera in acetato è pensata per un comfort prolungato, anche dopo ore di utilizzo continuo.</p>' +
      '<ul><li>Lenti polarizzate, protezione UV400</li><li>Montatura in acetato leggero</li><li>Custodia rigida inclusa</li></ul>',
    status: 'active',
    priceCents: 4900,
    compareAtCents: 6900,
    imageCount: 2,
    options: [],
    variants: [{ sku: 'OCC-DEFAULT', selection: [], stock: 25 }],
    collectionSlugs: ['accessori', 'novita'],
  },
  {
    slug: 'portafoglio-pelle-slim',
    title: 'Portafoglio in Pelle Slim',
    excerpt: 'Portafoglio slim in pelle, profilo sottile per tasca o borsa.',
    description:
      "<p>Il Portafoglio in Pelle Slim è stato disegnato per chi vuole portare con sé l'essenziale senza ingombro. Gli scomparti per carte e il vano banconote centrale sono ottimizzati per uno spessore minimo.</p>" +
      "<p>La pelle pieno fiore utilizzata si ammorbidisce con l'uso, mantenendo comunque un'ottima resistenza nel tempo.</p>" +
      '<ul><li>Pelle pieno fiore</li><li>6 scomparti porta carte</li><li>Profilo slim, spessore ridotto</li></ul>',
    status: 'active',
    priceCents: 2500,
    imageCount: 2,
    options: [{ name: 'Colore', values: ['Nero', 'Testa di moro'] }],
    variants: [
      { sku: 'POR-NER', selection: ['Nero'], stock: 18 },
      { sku: 'POR-TDM', selection: ['Testa di moro'], stock: 2 },
    ],
    collectionSlugs: ['accessori'],
  },
  // ---------------------------------------------------------------- Casa
  {
    slug: 'candela-profumata-sandalo',
    title: 'Candela Profumata Legno di Sandalo',
    excerpt: 'Candela in cera vegetale profumata al legno di sandalo, durata fino a 40 ore.',
    description:
      '<p>La Candela Profumata Legno di Sandalo diffonde una fragranza calda e avvolgente, ottenuta da cera vegetale al 100% e stoppino in cotone senza piombo, per una combustione pulita e uniforme.</p>' +
      '<p>Disponibile in due formati, è pensata per creare atmosfera in ogni ambiente della casa.</p>' +
      '<ul><li>Cera vegetale 100%</li><li>Stoppino in cotone senza piombo</li><li>Fragranza legno di sandalo</li></ul>',
    status: 'active',
    priceCents: 1500,
    imageCount: 2,
    options: [{ name: 'Formato', values: ['Piccola', 'Grande'] }],
    variants: [
      { sku: 'CAN-PIC', selection: ['Piccola'], stock: 40, priceCents: 1500 },
      { sku: 'CAN-GRA', selection: ['Grande'], stock: 0, priceCents: 2500 },
    ],
    collectionSlugs: ['casa'],
  },
  {
    slug: 'tazza-ceramica-dipinta',
    title: 'Tazza in Ceramica Dipinta a Mano',
    excerpt: 'Tazza in ceramica dipinta a mano, pezzo unico per la colazione.',
    description:
      '<p>Ogni Tazza in Ceramica Dipinta a Mano è un pezzo unico: le lievi variazioni di smalto e decoro sono la firma della lavorazione artigianale, non un difetto.</p>' +
      "<p>Adatta a lavastoviglie e microonde, unisce la bellezza dell'oggetto fatto a mano alla praticità dell'uso quotidiano.</p>" +
      '<ul><li>Ceramica dipinta a mano</li><li>Capacità 300 ml</li><li>Lavastoviglie e microonde</li></ul>',
    status: 'active',
    priceCents: 900,
    imageCount: 2,
    options: [],
    variants: [{ sku: 'TAZ-DEFAULT', selection: [], stock: 50 }],
    collectionSlugs: ['casa'],
  },
  {
    slug: 'plaid-cotone-righe',
    title: 'Plaid in Cotone a Righe',
    excerpt: 'Plaid in cotone a righe, morbido e caldo per il divano di casa.',
    description:
      '<p>Il Plaid in Cotone a Righe è realizzato in cotone a doppia trama, che garantisce morbidezza e una buona capacità di trattenere il calore senza appesantire.</p>' +
      '<p>Le frange laterali rifinite a mano completano un accessorio pensato per arredare e scaldare il divano o il letto.</p>' +
      '<ul><li>Cotone 100% a doppia trama</li><li>Frange rifinite a mano</li><li>Dimensioni 130x170 cm</li></ul>',
    status: 'active',
    priceCents: 4500,
    imageCount: 3,
    options: [{ name: 'Colore', values: ['Senape', 'Grigio', 'Terracotta'] }],
    variants: [
      { sku: 'PLA-SEN', selection: ['Senape'], stock: 14 },
      { sku: 'PLA-GRI', selection: ['Grigio'], stock: 3 },
      { sku: 'PLA-TER', selection: ['Terracotta'], stock: 22 },
    ],
    collectionSlugs: ['casa'],
  },
  {
    // Bozza: non deve apparire nelle rotte pubbliche, ma è visibile in admin.
    slug: 'cuscino-decorativo-velluto',
    title: 'Cuscino Decorativo in Velluto',
    excerpt: 'Cuscino decorativo in velluto, texture morbida e colori intensi.',
    description:
      '<p>Il Cuscino Decorativo in Velluto aggiunge una nota di colore e morbidezza a divani e poltrone. Il tessuto in velluto restituisce una texture setosa al tatto e colori particolarmente saturi.</p>' +
      "<p>La federa è sfoderabile e lavabile, mentre l'imbottitura in fibra cava mantiene la forma nel tempo.</p>" +
      '<ul><li>Velluto 100% poliestere</li><li>Federa sfoderabile e lavabile</li><li>Imbottitura in fibra cava siliconata</li></ul>',
    status: 'draft',
    priceCents: 3200,
    imageCount: 2,
    options: [{ name: 'Colore', values: ['Verde', 'Blu'] }],
    variants: [
      { sku: 'CUS-VER', selection: ['Verde'], stock: 10 },
      { sku: 'CUS-BLU', selection: ['Blu'], stock: 0 },
    ],
    collectionSlugs: ['casa'],
  },
]
