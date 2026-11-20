import { redirect } from 'next/navigation'
import { MDK_HOME } from '@/lib/business-units'

// Todos arrancan en el Inicio de Conexa. Quien solo tiene acceso a Aurelia ya
// es redirigido a su sección por el middleware antes de llegar acá.
export default function DashboardPage() {
  redirect(`${MDK_HOME}?vista=inicio`)
}
