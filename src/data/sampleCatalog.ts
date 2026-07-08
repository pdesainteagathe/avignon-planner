import type { Catalog, Performance, Show } from '../types'

// A small, realistic-ish sample so the app works end-to-end before the real
// scraped catalog (public/catalog.json) is available. Festival Off 2026 runs
// 4–25 July; these use the second week.

let seq = 0
function perfs(dates: string[], time: string, soldOut: string[] = []): Performance[] {
  return dates.map((date) => ({
    id: `p${seq++}`,
    start: `${date}T${time}`,
    available: soldOut.includes(date) ? false : true,
  }))
}

const week = ['2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11', '2026-07-12']

const shows: Show[] = [
  {
    id: 's1',
    title: 'Le Malade imaginaire',
    company: 'Cie du Grenier',
    genre: 'Théâtre / Classique',
    venue: 'Théâtre du Chêne Noir',
    durationMin: 95,
    performances: perfs(week, '10:00', ['2026-07-10']),
  },
  {
    id: 's2',
    title: 'Seul en scène : Mécaniques',
    company: 'Antoine Vasseur',
    genre: 'Humour',
    venue: 'La Luna',
    durationMin: 75,
    performances: perfs(week, '11:30'),
  },
  {
    id: 's3',
    title: 'Antigone, maintenant',
    company: 'Collectif 1926',
    genre: 'Théâtre / Contemporain',
    venue: 'Théâtre des Halles',
    durationMin: 90,
    performances: perfs(week, '14:00'),
  },
  {
    id: 's4',
    title: 'Cabaret Balkanique',
    company: 'Fanfare Zdravo',
    genre: 'Musique',
    venue: 'Le 11 · Avignon',
    durationMin: 80,
    performances: perfs(week, '15:30', ['2026-07-08', '2026-07-09']),
  },
  {
    id: 's5',
    title: 'Kant pour les enfants',
    company: 'Cie Petite Lune',
    genre: 'Jeune public',
    venue: 'Théâtre du Roi René',
    durationMin: 55,
    performances: perfs(week, '10:15'),
  },
  {
    id: 's6',
    title: 'La Nuit des rois',
    company: 'Shakespeare & Co',
    genre: 'Théâtre / Classique',
    venue: 'Théâtre Buffon',
    durationMin: 105,
    performances: perfs(week, '17:00'),
  },
  {
    id: 's7',
    title: 'Stand-up : Bête de scène',
    company: 'Nadia K.',
    genre: 'Humour',
    venue: 'La Scala Provence',
    durationMin: 70,
    performances: perfs(week, '18:30'),
  },
  {
    id: 's8',
    title: 'Concert : Cordes sensibles',
    company: 'Quatuor Éphémère',
    genre: 'Musique',
    venue: 'Cloître des Carmes',
    durationMin: 85,
    performances: perfs(week, '20:00', ['2026-07-11']),
  },
  {
    id: 's9',
    title: 'Danse : Terra',
    company: 'Cie Ombres Portées',
    genre: 'Danse',
    venue: 'Théâtre Golovine',
    durationMin: 60,
    performances: perfs(week, '19:00'),
  },
  {
    id: 's10',
    title: 'Impro totale',
    company: 'Les Improbables',
    genre: 'Humour / Impro',
    venue: 'Théâtre de la Bourse du Travail',
    durationMin: 75,
    performances: perfs(week, '21:45'),
  },
  {
    id: 's11',
    title: 'Le Petit Prince',
    company: 'Cie des Étoiles',
    genre: 'Jeune public',
    venue: 'Théâtre du Petit Louvre',
    durationMin: 65,
    performances: perfs(week, '16:00'),
  },
  {
    id: 's12',
    title: 'Monologue : Ma part d’ombre',
    company: 'Élise Rambert',
    genre: 'Théâtre / Contemporain',
    venue: 'Le Train Bleu',
    durationMin: 70,
    performances: perfs(week, '13:30'),
  },
  {
    id: 's13',
    title: 'Tragédie express',
    company: 'Cie Vent Debout',
    genre: 'Théâtre',
    venue: 'Théâtre des Béliers',
    durationMin: 80,
    performances: perfs(week, '22:15'),
  },
  {
    id: 's14',
    title: 'Jazz manouche au clair de lune',
    company: 'Django Now',
    genre: 'Musique',
    venue: 'AJMI Jazz Club',
    durationMin: 90,
    performances: perfs(week, '20:30'),
  },
]

export const sampleCatalog: Catalog = {
  source: 'Catalogue de démonstration (données fictives)',
  generatedAt: '2026-07-08T09:00',
  shows,
}
