'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface ImportResult {
  cliente: string
  status: 'success' | 'error' | 'not_found'
  message: string
}

export default function ImportMemoriaPage() {
  const [csvContent, setCsvContent] = useState('')
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<ImportResult[]>([])
  
  const supabase = createClient()

  const parseCSV = (content: string) => {
    const lines = content.split('\n')
    const records: { cliente: string; comentario: string }[] = []
    
    let currentCliente = ''
    let currentComentario = ''
    let inQuotes = false
    
    for (let i = 1; i < lines.length; i++) { // Skip header
      const line = lines[i]
      
      if (!inQuotes) {
        // Check if this line starts a new record
        const match = line.match(/^([^,]+),(.*)$/)
        if (match) {
          // Save previous record if exists
          if (currentCliente && currentComentario) {
            records.push({ cliente: currentCliente.trim(), comentario: currentComentario.trim() })
          }
          
          currentCliente = match[1].replace(/"/g, '')
          const rest = match[2]
          
          if (rest.startsWith('"')) {
            currentComentario = rest.substring(1)
            inQuotes = !rest.endsWith('"') || rest === '"'
            if (rest.endsWith('"') && rest !== '"') {
              currentComentario = currentComentario.slice(0, -1)
              inQuotes = false
            }
          } else {
            currentComentario = rest
          }
        }
      } else {
        // We're inside a quoted field
        if (line.endsWith('"')) {
          currentComentario += '\n' + line.slice(0, -1)
          inQuotes = false
        } else {
          currentComentario += '\n' + line
        }
      }
    }
    
    // Don't forget the last record
    if (currentCliente && currentComentario) {
      records.push({ cliente: currentCliente.trim(), comentario: currentComentario.trim() })
    }
    
    return records
  }

  const handleImport = async () => {
    setImporting(true)
    setResults([])
    
    try {
      const records = parseCSV(csvContent)
      const importResults: ImportResult[] = []
      
      // Get all clients for matching
      const { data: clientes } = await supabase
        .from('clientes')
        .select('id, nombre_del_negocio')
      
      for (const record of records) {
        // Find matching client (case insensitive, partial match)
        const cliente = clientes?.find(c => 
          c.nombre_del_negocio?.toLowerCase().includes(record.cliente.toLowerCase()) ||
          record.cliente.toLowerCase().includes(c.nombre_del_negocio?.toLowerCase() || '')
        )
        
        if (cliente) {
          // Check if memoria already exists
          const { data: existing } = await supabase
            .from('cliente_memoria')
            .select('id')
            .eq('cliente_id', cliente.id)
            .single()
          
          if (existing) {
            // Update existing
            const { error } = await supabase
              .from('cliente_memoria')
              .update({ contenido: record.comentario, updated_at: new Date().toISOString() })
              .eq('id', existing.id)
            
            importResults.push({
              cliente: record.cliente,
              status: error ? 'error' : 'success',
              message: error ? error.message : `Actualizado en ${cliente.nombre_del_negocio}`
            })
          } else {
            // Insert new
            const { error } = await supabase
              .from('cliente_memoria')
              .insert({ cliente_id: cliente.id, contenido: record.comentario })
            
            importResults.push({
              cliente: record.cliente,
              status: error ? 'error' : 'success',
              message: error ? error.message : `Importado a ${cliente.nombre_del_negocio}`
            })
          }
        } else {
          importResults.push({
            cliente: record.cliente,
            status: 'not_found',
            message: 'Cliente no encontrado en la base de datos'
          })
        }
      }
      
      setResults(importResults)
    } catch (e) {
      console.error('Import error:', e)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Importar Memoria de Clientes</h1>
        <p className="text-muted-foreground mt-1">Importa los historicos de comentarios desde un archivo CSV</p>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Contenido CSV</CardTitle>
          <CardDescription>
            Pega el contenido del CSV con formato: CLIENTE,COMENTARIO
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            placeholder="CLIENTE,COMENTARIO&#10;Inmobiliaria Zamora,&quot;Aquí tienes un resumen...&quot;"
            className="min-h-[300px] font-mono text-sm"
          />
          <Button onClick={handleImport} disabled={importing || !csvContent.trim()}>
            {importing ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando...</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" /> Importar Memorias</>
            )}
          </Button>
        </CardContent>
      </Card>
      
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resultados de Importacion</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {results.map((result, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  {result.status === 'success' ? (
                    <CheckCircle2 className="h-5 w-5 text-status-verde shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-status-rojo shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="font-medium text-foreground">{result.cliente}</p>
                    <p className="text-sm text-muted-foreground">{result.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
