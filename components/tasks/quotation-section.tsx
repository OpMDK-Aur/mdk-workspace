'use client'

import { useState, useEffect } from 'react'
import type { Task } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useTaskStore } from '@/lib/tasks/task-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Calculator, Download, Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// ── Business Units ─────────────────────────────────────────────────────────────

type BusinessUnit = 'mdk' | 'aurelia'

// ── Service Categories & Items ─────────────────────────────────────────────────

interface ServiceItem {
  id: string
  name: string
  description?: string
  priceARS: number
  priceUSD?: number
  unit: 'mes' | 'unico' | 'hora' | 'unidad'
  includesIVA: boolean
  category: string
}

interface PlanItem {
  id: string
  name: string
  description?: string
  priceARS?: number
  priceUSD?: number
  isPercentage?: boolean
  percentageValue?: number
  minInvestment?: number
  maxInvestment?: number
  features?: string[]
  unit: 'mes' | 'unico'
  includesIVA: boolean
}

// MDK Services
const MDK_PAUTA_PLANS: PlanItem[] = [
  {
    id: 'pauta-crecimiento',
    name: 'Plan Crecimiento',
    description: 'Inversion: $500,000 a $999,999 + imp.',
    priceARS: 1200000,
    isPercentage: true,
    percentageValue: 20,
    minInvestment: 500000,
    maxInvestment: 999999,
    unit: 'mes',
    includesIVA: false,
    features: [
      'Gestion Meta Ads y Google Ads',
      'Project Manager y Account Manager asignado',
      'Reuniones de seguimiento mensual',
      'Informe de resultados en tiempo real',
      'Landing Page (si es necesario)',
      '2 Videos cortos + 5 piezas graficas',
    ],
  },
  {
    id: 'pauta-expansion',
    name: 'Plan Expansion',
    description: 'Inversion: $1,000,000 a $4,999,999 + imp.',
    priceARS: 1200000,
    isPercentage: true,
    percentageValue: 20,
    minInvestment: 1000000,
    maxInvestment: 4999999,
    unit: 'mes',
    includesIVA: false,
    features: [
      'Gestion Meta Ads y Google Ads',
      'Project Manager y Account Manager asignado',
      'Reuniones de seguimiento mensual',
      'Informe de resultados en tiempo real',
      'Landing Page (si es necesario)',
      '2 Videos cortos + 5 piezas graficas',
    ],
  },
  {
    id: 'pauta-escala',
    name: 'Plan Escala',
    description: 'Inversion: $5,000,000 a $9,999,999 + imp.',
    isPercentage: true,
    percentageValue: 20,
    minInvestment: 5000000,
    maxInvestment: 9999999,
    unit: 'mes',
    includesIVA: false,
    features: [
      'Gestion Meta Ads y Google Ads',
      'Project Manager y Account Manager asignado',
      'Reuniones de seguimiento mensual',
      'Informe de resultados en tiempo real',
      'Landing Page (si es necesario)',
      '2 Videos cortos + 5 piezas graficas',
    ],
  },
  {
    id: 'pauta-dominio',
    name: 'Plan Dominio',
    description: 'Inversion: $10,000,000+ imp.',
    isPercentage: true,
    percentageValue: 18,
    minInvestment: 10000000,
    unit: 'mes',
    includesIVA: false,
    features: [
      'Gestion Meta Ads y Google Ads',
      'Project Manager y Account Manager asignado',
      'Reuniones de seguimiento mensual',
      'Informe de resultados en tiempo real',
      'Landing Page (si es necesario)',
      '2 Videos cortos + 5 piezas graficas',
    ],
  },
]

const MDK_DESIGN_SERVICES: ServiceItem[] = [
  { id: 'banner', name: 'Banner', description: 'Creatividades para campanas', priceARS: 21300, unit: 'unidad', includesIVA: false, category: 'diseno' },
  { id: 'adaptacion-banner', name: 'Adaptacion de banners', description: 'Modificaciones o cambios de formato', priceARS: 14100, unit: 'unidad', includesIVA: false, category: 'diseno' },
  { id: 'landing-inicial', name: 'Diseno e implementacion Landing Page', priceARS: 339100, priceUSD: 250, unit: 'unico', includesIVA: false, category: 'diseno' },
  { id: 'landing-mantenimiento', name: 'Mantenimiento Landing Page', description: 'No incluye modificaciones o rediseno', priceARS: 68600, priceUSD: 20, unit: 'mes', includesIVA: false, category: 'diseno' },
]

const MDK_EMAIL_SERVICES: ServiceItem[] = [
  { id: 'email-unico', name: 'Envio unico (2,500 envios)', description: 'Una plantilla, diseno, armado, programacion', priceARS: 113300, priceUSD: 65, unit: 'unico', includesIVA: false, category: 'email' },
  { id: 'email-mensual', name: 'Paquete Mensual (20,000 envios)', description: '5 plantillas, diseno, armado, hasta 5 envios', priceARS: 681600, priceUSD: 265, unit: 'mes', includesIVA: false, category: 'email' },
]

const MDK_AUTOMATION_SERVICES: ServiceItem[] = [
  { id: 'automation-1', name: 'Marketing Automation - 1 Funnel', description: '4 niveles de profundidad', priceARS: 373500, priceUSD: 250, unit: 'mes', includesIVA: false, category: 'automation' },
  { id: 'automation-3', name: 'Marketing Automation - 3 Funnels', description: '4 niveles de profundidad', priceARS: 747600, priceUSD: 450, unit: 'mes', includesIVA: false, category: 'automation' },
  { id: 'automation-5', name: 'Marketing Automation - 5 Funnels', description: '4 niveles de profundidad', priceARS: 911500, priceUSD: 550, unit: 'mes', includesIVA: false, category: 'automation' },
]

const MDK_TECH_SERVICES: ServiceItem[] = [
  { id: 'desarrollo-hora', name: 'Desarrollo de Integraciones', description: 'Hora de desarrollo', priceARS: 50000, unit: 'hora', includesIVA: false, category: 'tech' },
  { id: 'mantenimiento-base', name: 'Mantenimiento Base Integraciones', description: '2 horas de mantenimiento mensual', priceARS: 100000, unit: 'mes', includesIVA: false, category: 'tech' },
  { id: 'mantenimiento-paquete', name: 'Paquete Variable (1000 ejecuciones)', description: 'Costo por consumo', priceARS: 89000, unit: 'mes', includesIVA: false, category: 'tech' },
]

// Aurelia Services
const AURELIA_CRM_PLANS: PlanItem[] = [
  {
    id: 'aurelia-starter',
    name: 'Starter',
    description: 'Para duenos de PyMEs',
    priceUSD: 59,
    unit: 'mes',
    includesIVA: false,
    features: [
      '1,500 mensajes IA/mes',
      '~300 leads mensuales aprox.',
      '1 agente IA',
      '1 numero de WhatsApp',
      '1 embudo de ventas',
      'Hasta 3 usuarios',
    ],
  },
  {
    id: 'aurelia-growth',
    name: 'Growth',
    description: 'Para equipos en crecimiento',
    priceUSD: 199,
    unit: 'mes',
    includesIVA: false,
    features: [
      '4,000 mensajes IA/mes',
      '~800 leads mensuales aprox.',
      'Agentes IA ilimitados',
      '3 numeros de WhatsApp',
      'Embudos ilimitados',
      'Hasta 10 usuarios',
    ],
  },
  {
    id: 'aurelia-pro',
    name: 'Pro',
    description: 'Para alto volumen',
    priceUSD: 299,
    unit: 'mes',
    includesIVA: false,
    features: [
      '10,000 mensajes IA/mes',
      '~1,500 leads mensuales aprox.',
      'Agentes IA ilimitados',
      '10 numeros de WhatsApp',
      'Embudos y usuarios ilimitados',
      'Prioridad en soporte',
      'Account manager dedicado',
    ],
  },
]

const AURELIA_CHATBOT_PLANS: PlanItem[] = [
  {
    id: 'chatbot-basico',
    name: 'Chatbot Basico',
    priceARS: 110600,
    unit: 'mes',
    includesIVA: false,
    features: [
      '1 Chatbot',
      '1 Sitio Web',
      'Hasta 250 conversaciones finalizadas',
      'Preguntas: Nombre, telefono, email',
      'Atencion 24/7',
      'Integracion a CRM',
      'Widget Estandar',
    ],
  },
  {
    id: 'chatbot-profesional',
    name: 'Chatbot Profesional',
    priceARS: 249400,
    unit: 'mes',
    includesIVA: false,
    features: [
      'Hasta 2 Chatbots',
      '2 Sitios Web',
      'Hasta 1000 conversaciones finalizadas',
      'Preguntas Personalizadas',
      'Atencion 24/7 por Dia y Horario',
      'Integracion a CRM',
      'Widget Personalizado',
    ],
  },
  {
    id: 'chatbot-avanzado',
    name: 'Chatbot Avanzado',
    priceARS: 664400,
    unit: 'mes',
    includesIVA: false,
    features: [
      'Hasta 5 Chatbots',
      '3 Sitios Web',
      'Hasta 5000 conversaciones finalizadas',
      'Preguntas Personalizadas',
      'Atencion 24/7 por Dia y Horario',
      'Integracion a CRM',
      'Widget Personalizado',
    ],
  },
]

// ── Quotation Item Interface ───────────────────────────────────────────────────

interface QuotationLineItem {
  id: string
  serviceId: string
  serviceName: string
  quantity: number
  unitPrice: number
  priceUSD?: number
  unit: string
  total: number
  includesIVA: boolean
  investment?: number // For percentage-based plans
}

// ── Format Currency ────────────────────────────────────────────────────────────

function formatCurrencyARS(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatCurrencyUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function QuotationSection({ task }: { task: Task }) {
  const { updateQuotation } = useTaskStore()
  const [businessUnit, setBusinessUnit] = useState<BusinessUnit>('mdk')
  const [lineItems, setLineItems] = useState<QuotationLineItem[]>([])
  const [investment, setInvestment] = useState(0)

  const IVA_RATE = 0.21

  // Calculate totals
  const subtotalARS = lineItems.reduce((acc, item) => acc + item.total, 0)
  const ivaARS = subtotalARS * IVA_RATE
  const totalARS = subtotalARS + ivaARS

  const handleAddService = (service: ServiceItem) => {
    const existing = lineItems.find((item) => item.serviceId === service.id)
    if (existing) {
      setLineItems((prev) =>
        prev.map((item) =>
          item.serviceId === service.id
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.unitPrice }
            : item
        )
      )
    } else {
      setLineItems((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          serviceId: service.id,
          serviceName: service.name,
          quantity: 1,
          unitPrice: service.priceARS,
          priceUSD: service.priceUSD,
          unit: service.unit,
          total: service.priceARS,
          includesIVA: service.includesIVA,
        },
      ])
    }
  }

  const handleAddPlan = (plan: PlanItem) => {
    const existing = lineItems.find((item) => item.serviceId === plan.id)
    if (existing) return // Plans are typically one per quotation

    let price = plan.priceARS || 0
    if (plan.isPercentage && investment > 0) {
      price = Math.max(plan.priceARS || 0, investment * (plan.percentageValue! / 100))
    }

    setLineItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        serviceId: plan.id,
        serviceName: plan.name,
        quantity: 1,
        unitPrice: price,
        priceUSD: plan.priceUSD,
        unit: plan.unit,
        total: price,
        includesIVA: plan.includesIVA,
        investment: plan.isPercentage ? investment : undefined,
      },
    ])
  }

  const handleUpdateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      setLineItems((prev) => prev.filter((item) => item.id !== itemId))
    } else {
      setLineItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, quantity, total: quantity * item.unitPrice }
            : item
        )
      )
    }
  }

  const handleRemoveItem = (itemId: string) => {
    setLineItems((prev) => prev.filter((item) => item.id !== itemId))
  }

  const handleExportPDF = () => {
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cotizacion - ${task.clientName}</title>
        <style>
          * { box-sizing: border-box; }
          body { 
            font-family: 'Segoe UI', system-ui, sans-serif; 
            padding: 40px; 
            max-width: 800px; 
            margin: 0 auto; 
            color: #1a1a1a;
            line-height: 1.5;
          }
          .header { 
            display: flex; 
            justify-content: space-between; 
            align-items: flex-start;
            margin-bottom: 32px;
            padding-bottom: 24px;
            border-bottom: 2px solid #e5e5e5;
          }
          .logo { 
            font-size: 28px; 
            font-weight: bold; 
            color: ${businessUnit === 'mdk' ? '#6366f1' : '#a855f7'};
          }
          .quote-info { text-align: right; }
          .quote-info p { margin: 4px 0; color: #666; font-size: 14px; }
          h1 { font-size: 24px; margin: 0 0 8px 0; color: #1a1a1a; }
          .client-info { 
            background: #f9fafb; 
            padding: 20px; 
            border-radius: 8px; 
            margin-bottom: 24px;
          }
          .client-info h3 { margin: 0 0 4px 0; font-size: 16px; color: #666; }
          .client-info p { margin: 0; font-size: 18px; font-weight: 600; }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 24px 0; 
            font-size: 14px;
          }
          th { 
            background: #f3f4f6; 
            padding: 12px; 
            text-align: left; 
            font-weight: 600;
            border-bottom: 2px solid #e5e5e5;
          }
          td { 
            padding: 12px; 
            border-bottom: 1px solid #e5e5e5;
          }
          .text-right { text-align: right; }
          .totals { 
            margin-top: 24px; 
            padding: 20px;
            background: #f9fafb;
            border-radius: 8px;
          }
          .totals-row { 
            display: flex; 
            justify-content: space-between; 
            padding: 8px 0;
          }
          .totals-row.total { 
            font-size: 20px; 
            font-weight: bold; 
            border-top: 2px solid #e5e5e5;
            padding-top: 16px;
            margin-top: 8px;
          }

          .footer { 
            margin-top: 48px; 
            padding-top: 24px;
            border-top: 1px solid #e5e5e5;
            color: #999; 
            font-size: 12px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo">${businessUnit === 'mdk' ? 'MDK' : 'Aurelia'}</div>
            <p style="color:#666;margin:4px 0 0 0;">Marketing & Tecnologia</p>
          </div>
          <div class="quote-info">
            <p><strong>Cotizacion</strong></p>
            <p>Fecha: ${format(new Date(), 'dd/MM/yyyy', { locale: es })}</p>
            <p>Ref: ${task.id.slice(0, 8).toUpperCase()}</p>
          </div>
        </div>
        
        <div class="client-info">
          <h3>Cliente</h3>
          <p>${task.clientName}</p>
        </div>

        <h2 style="font-size:18px;margin-bottom:16px;">Detalle de Servicios</h2>
        
        <table>
          <thead>
            <tr>
              <th>Servicio</th>
              <th class="text-right">Cant.</th>
              <th class="text-right">Precio Unit.</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${lineItems.map((item) => `
              <tr>
                <td>${item.serviceName}${item.investment ? ` (Inversion: ${formatCurrencyARS(item.investment)})` : ''}</td>
                <td class="text-right">${item.quantity}</td>
                <td class="text-right">${formatCurrencyARS(item.unitPrice)}${item.priceUSD ? ` (${formatCurrencyUSD(item.priceUSD)})` : ''}</td>
                <td class="text-right">${formatCurrencyARS(item.total)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="totals">
          <div class="totals-row">
            <span>Subtotal</span>
            <span>${formatCurrencyARS(subtotalARS)}</span>
          </div>
          <div class="totals-row">
            <span>IVA (21%)</span>
            <span>${formatCurrencyARS(ivaARS)}</span>
          </div>
          <div class="totals-row total">
            <span>TOTAL</span>
            <span>${formatCurrencyARS(totalARS)}</span>
          </div>
        </div>
        

        
        <div class="footer">
          <p>Cotizacion valida por 15 dias</p>
          <p>MDK Workspace - ${format(new Date(), 'yyyy')}</p>
        </div>
      </body>
      </html>
    `

    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(printContent)
      printWindow.document.close()
      setTimeout(() => printWindow.print(), 250)
    }
  }

  return (
    <div className="space-y-4">
      {/* Business Unit Selector */}
      <div className="flex items-center gap-3">
        <Label className="text-sm">Unidad de Negocio:</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={businessUnit === 'mdk' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setBusinessUnit('mdk')}
            className={cn(businessUnit === 'mdk' && 'bg-indigo-600 hover:bg-indigo-700')}
          >
            MDK
          </Button>
          <Button
            type="button"
            variant={businessUnit === 'aurelia' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setBusinessUnit('aurelia')}
            className={cn(businessUnit === 'aurelia' && 'bg-purple-600 hover:bg-purple-700')}
          >
            Aurelia
          </Button>
        </div>
      </div>

      {/* Service Catalog */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-sm font-medium mb-3">Catalogo de Servicios</p>
        
        <Accordion type="multiple" className="w-full">
          {businessUnit === 'mdk' && (
            <>
              {/* Pauta Plans */}
              <AccordionItem value="pauta">
                <AccordionTrigger className="text-sm">Planes de Pauta Publicitaria</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-3">
                      <Label className="text-xs">Inversion mensual neta:</Label>
                      <Input
                        type="number"
                        placeholder="$0"
                        className="h-8 w-40"
                        value={investment || ''}
                        onChange={(e) => setInvestment(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    {MDK_PAUTA_PLANS.map((plan) => (
                      <div key={plan.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                        <div>
                          <p className="text-sm font-medium">{plan.name}</p>
                          <p className="text-xs text-muted-foreground">{plan.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {plan.priceARS ? `${formatCurrencyARS(plan.priceARS)} o ` : ''}
                            {plan.percentageValue}% de inversion
                          </p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => handleAddPlan(plan)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Design */}
              <AccordionItem value="diseno">
                <AccordionTrigger className="text-sm">Diseno</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    {MDK_DESIGN_SERVICES.map((service) => (
                      <div key={service.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                        <div>
                          <p className="text-sm font-medium">{service.name}</p>
                          {service.description && <p className="text-xs text-muted-foreground">{service.description}</p>}
                          <p className="text-xs text-muted-foreground">
                            {formatCurrencyARS(service.priceARS)} + IVA / {service.unit}
                            {service.priceUSD && ` (${formatCurrencyUSD(service.priceUSD)})`}
                          </p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => handleAddService(service)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Email Marketing */}
              <AccordionItem value="email">
                <AccordionTrigger className="text-sm">Email Marketing</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    {MDK_EMAIL_SERVICES.map((service) => (
                      <div key={service.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                        <div>
                          <p className="text-sm font-medium">{service.name}</p>
                          {service.description && <p className="text-xs text-muted-foreground">{service.description}</p>}
                          <p className="text-xs text-muted-foreground">
                            {formatCurrencyARS(service.priceARS)} + IVA
                            {service.priceUSD && ` (${formatCurrencyUSD(service.priceUSD)})`}
                          </p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => handleAddService(service)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Marketing Automation */}
              <AccordionItem value="automation">
                <AccordionTrigger className="text-sm">Marketing Automation</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    {MDK_AUTOMATION_SERVICES.map((service) => (
                      <div key={service.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                        <div>
                          <p className="text-sm font-medium">{service.name}</p>
                          {service.description && <p className="text-xs text-muted-foreground">{service.description}</p>}
                          <p className="text-xs text-muted-foreground">
                            {formatCurrencyARS(service.priceARS)} + IVA / {service.unit}
                            {service.priceUSD && ` (${formatCurrencyUSD(service.priceUSD)})`}
                          </p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => handleAddService(service)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Tech / Integraciones */}
              <AccordionItem value="tech">
                <AccordionTrigger className="text-sm">Servicio de Integraciones</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    {MDK_TECH_SERVICES.map((service) => (
                      <div key={service.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                        <div>
                          <p className="text-sm font-medium">{service.name}</p>
                          {service.description && <p className="text-xs text-muted-foreground">{service.description}</p>}
                          <p className="text-xs text-muted-foreground">
                            {formatCurrencyARS(service.priceARS)} + IVA / {service.unit}
                          </p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => handleAddService(service)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </>
          )}

          {businessUnit === 'aurelia' && (
            <>
              {/* Aurelia CRM Plans */}
              <AccordionItem value="crm">
                <AccordionTrigger className="text-sm">Planes Aurelia CRM</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    {AURELIA_CRM_PLANS.map((plan) => (
                      <div key={plan.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                        <div>
                          <p className="text-sm font-medium">{plan.name}</p>
                          <p className="text-xs text-muted-foreground">{plan.description}</p>
                          <p className="text-xs font-medium text-purple-400">
                            {formatCurrencyUSD(plan.priceUSD!)} / mes
                          </p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => handleAddPlan(plan)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Chatbot Plans */}
              <AccordionItem value="chatbot">
                <AccordionTrigger className="text-sm">Chatbot</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    {AURELIA_CHATBOT_PLANS.map((plan) => (
                      <div key={plan.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                        <div>
                          <p className="text-sm font-medium">{plan.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrencyARS(plan.priceARS!)} + IVA / mes
                          </p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => handleAddPlan(plan)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </>
          )}
        </Accordion>
      </div>

      {/* Line Items */}
      {lineItems.length > 0 && (
        <div className="rounded-lg border bg-background p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Items de Cotizacion</p>
            <Badge variant="outline">{lineItems.length} items</Badge>
          </div>

          <div className="space-y-2">
            {lineItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-2 rounded bg-muted/50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.serviceName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrencyARS(item.unitPrice)} x {item.quantity} {item.unit}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => handleUpdateQuantity(item.id, parseInt(e.target.value) || 1)}
                    className="h-8 w-16 text-center"
                  />
                  <span className="text-sm font-medium w-24 text-right">
                    {formatCurrencyARS(item.total)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleRemoveItem(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Separator />

          {/* Totals */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrencyARS(subtotalARS)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IVA (21%)</span>
              <span>{formatCurrencyARS(ivaARS)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold text-base">
              <span>Total</span>
              <span className="text-green-400">{formatCurrencyARS(totalARS)}</span>
            </div>
          </div>

          {/* Export Button */}
          <Button className="w-full gap-2" onClick={handleExportPDF}>
            <Download className="h-4 w-4" />
            Exportar PDF
          </Button>
        </div>
      )}

      {lineItems.length === 0 && (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <Calculator className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Selecciona servicios del catalogo para crear una cotizacion
          </p>
        </div>
      )}
    </div>
  )
}
