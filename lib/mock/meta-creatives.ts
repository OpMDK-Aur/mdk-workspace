export type MetaCreative = {
  name: string
  campaign: string
  format: string
  impressions: string
  ctr: string
  spend: string
}

export const metaCreatives: MetaCreative[] = [
  { name: 'Oferta Octubre',      campaign: 'Meta Prospecting', format: 'Imagen · 1:1', impressions: '298.400', ctr: '2,1%', spend: '$156.000' },
  { name: 'Carrusel Producto',   campaign: 'Meta Prospecting', format: 'Carrusel',     impressions: '210.900', ctr: '1,6%', spend: '$98.000' },
  { name: 'Testimonio Cliente',  campaign: 'Meta Remarketing', format: 'Video · 9:16', impressions: '184.200', ctr: '0,4%', spend: '$42.000' },
  { name: 'UGC Cliente Real',    campaign: 'Meta Remarketing', format: 'Video · 1:1',  impressions: '132.700', ctr: '2,8%', spend: '$54.000' },
  { name: 'Beneficios Producto', campaign: 'Meta Prospecting', format: 'Imagen · 4:5', impressions: '176.300', ctr: '1,9%', spend: '$70.000' },
  { name: 'Antes / Después',     campaign: 'Meta Remarketing', format: 'Carrusel',     impressions: '96.100',  ctr: '2,3%', spend: '$38.000' },
]
