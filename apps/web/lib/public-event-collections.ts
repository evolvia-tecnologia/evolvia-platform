export const PUBLIC_EVENT_COLLECTIONS = [
  { href: '/eventos?period=CURRENT', label: 'Próximos' },
  { href: '/eventos?format=IN_PERSON', label: 'Presenciais' },
  { href: '/eventos?format=ONLINE', label: 'Online' },
  { href: '/eventos?profile=SCIENTIFIC_EVENT', label: 'Científicos' },
  { href: '/eventos?profile=FAIR_EXHIBITION', label: 'Feiras' },
  { href: '/eventos?profile=ENTERTAINMENT', label: 'Entretenimento' },
] as const;
