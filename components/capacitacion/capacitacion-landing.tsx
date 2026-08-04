'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { MessageCircle, CheckCircle } from 'lucide-react'

export function CapacitacionLanding() {
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    telefono: '',
    mensaje: '',
  })
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Simular envío de formulario
      await new Promise(resolve => setTimeout(resolve, 1500))
      console.log('Formulario enviado:', formData)
      setSubmitted(true)
      
      // Resetear el estado después de 3 segundos
      setTimeout(() => {
        setSubmitted(false)
        setFormData({ nombre: '', email: '', telefono: '', mensaje: '' })
      }, 3000)
    } catch (error) {
      console.error('Error al enviar formulario:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleWhatsAppClick = (type: 'direct' | 'form') => {
    let phoneNumber = '34600000000' // Número de WhatsApp de prueba
    let message = ''

    if (type === 'direct') {
      message = 'Hola! Me gustaría información sobre los cursos de capacitación.'
    } else {
      message = `Hola! Soy ${formData.nombre} (${formData.email}). ${formData.mensaje}`
    }

    const encodedMessage = encodeURIComponent(message)
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`
    window.open(whatsappUrl, '_blank')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Hero Section */}
      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
              Capacitación Profesional
            </h1>
            <p className="mt-4 text-xl text-slate-300">
              Prueba de integraciones con WhatsApp y formularios
            </p>
            <p className="mt-2 text-sm text-slate-400">
              Página de demostración para el equipo
            </p>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-12 md:grid-cols-2">
            {/* Left Side - Info */}
            <div className="flex flex-col justify-center space-y-8">
              <div>
                <h2 className="text-3xl font-bold text-white mb-4">
                  Nuestros Cursos
                </h2>
                <p className="text-slate-300 mb-6">
                  Accede a capacitación profesional diseñada para tu crecimiento. 
                  Contáctanos por WhatsApp para más información sobre nuestros programas.
                </p>
              </div>

              <div className="space-y-4">
                {[
                  'Desarrollo Web Avanzado',
                  'Mobile Apps con React Native',
                  'Diseño UX/UI Profesional',
                  'Marketing Digital Estratégico',
                  'Gestión de Proyectos Ágil',
                ].map((curso, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                    <span className="text-slate-200">{curso}</span>
                  </div>
                ))}
              </div>

              {/* Direct WhatsApp Button */}
              <Button
                onClick={() => handleWhatsAppClick('direct')}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-6 text-base gap-2"
              >
                <MessageCircle className="h-5 w-5" />
                Contactar por WhatsApp (Directo)
              </Button>
            </div>

            {/* Right Side - Form */}
            <div className="rounded-lg bg-slate-800 p-8 border border-slate-700">
              <h3 className="text-2xl font-bold text-white mb-6">
                Solicita Información
              </h3>

              {submitted ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <CheckCircle className="h-16 w-16 text-green-400" />
                  <p className="text-white text-lg font-semibold">
                    ¡Formulario enviado exitosamente!
                  </p>
                  <p className="text-slate-300 text-center">
                    Pronto nos pondremos en contacto contigo
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-200 mb-2">
                      Nombre
                    </label>
                    <Input
                      type="text"
                      name="nombre"
                      value={formData.nombre}
                      onChange={handleInputChange}
                      placeholder="Tu nombre completo"
                      required
                      className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-200 mb-2">
                      Email
                    </label>
                    <Input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="tu@email.com"
                      required
                      className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-200 mb-2">
                      Teléfono
                    </label>
                    <Input
                      type="tel"
                      name="telefono"
                      value={formData.telefono}
                      onChange={handleInputChange}
                      placeholder="+34 600 000 000"
                      required
                      className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-200 mb-2">
                      Mensaje
                    </label>
                    <Textarea
                      name="mensaje"
                      value={formData.mensaje}
                      onChange={handleInputChange}
                      placeholder="Cuéntanos qué curso te interesa..."
                      required
                      className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400 resize-none"
                      rows={4}
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-6 text-base"
                  >
                    {loading ? 'Enviando...' : 'Enviar Formulario'}
                  </Button>

                  {/* WhatsApp Button with Form Data */}
                  <Button
                    type="button"
                    onClick={() => handleWhatsAppClick('form')}
                    disabled={!formData.nombre || !formData.email || !formData.mensaje}
                    className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-6 text-base gap-2"
                  >
                    <MessageCircle className="h-5 w-5" />
                    Enviar por WhatsApp
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <section className="px-4 py-12 border-t border-slate-700">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-slate-400 text-sm">
            Esta es una página de prueba para validar integraciones con WhatsApp y formularios
          </p>
          <p className="text-slate-500 text-xs mt-2">
            Desarrollado para el equipo de capacitación
          </p>
        </div>
      </section>
    </div>
  )
}
