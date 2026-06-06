'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Webhook, Plus, ArrowDownToLine, ArrowUpFromLine, Copy, Trash2, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { toast } from 'sonner'

// Placeholder data - will be replaced with real data from database
const incomingWebhooks = [
  {
    id: '1',
    name: 'Nuevo lead desde landing',
    url: 'https://app.example.com/api/webhooks/incoming/abc123',
    event: 'lead.created',
    status: 'active',
    lastTriggered: '2024-01-15T10:30:00Z',
  },
]

const outgoingWebhooks = [
  {
    id: '1',
    name: 'Notificar a Slack',
    url: 'https://hooks.slack.com/services/xxx',
    event: 'task.completed',
    status: 'active',
    lastTriggered: '2024-01-15T14:20:00Z',
  },
]

export default function WebhooksPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [webhookType, setWebhookType] = useState<'incoming' | 'outgoing'>('incoming')
  const [newWebhookName, setNewWebhookName] = useState('')
  const [newWebhookUrl, setNewWebhookUrl] = useState('')
  const [newWebhookEvent, setNewWebhookEvent] = useState('')

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('URL copiada al portapapeles')
  }

  const handleCreateWebhook = () => {
    // TODO: Implement webhook creation
    toast.success('Webhook creado correctamente')
    setShowCreateDialog(false)
    setNewWebhookName('')
    setNewWebhookUrl('')
    setNewWebhookEvent('')
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configura webhooks entrantes como triggers y webhooks salientes para notificaciones.
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Crear webhook
        </Button>
      </div>

      <Tabs defaultValue="incoming" className="w-full">
        <TabsList>
          <TabsTrigger value="incoming" className="gap-2">
            <ArrowDownToLine className="h-4 w-4" />
            Entrantes (Triggers)
          </TabsTrigger>
          <TabsTrigger value="outgoing" className="gap-2">
            <ArrowUpFromLine className="h-4 w-4" />
            Salientes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="incoming" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Webhooks entrantes</CardTitle>
              <CardDescription>
                URLs que reciben datos externos y disparan acciones en la plataforma.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {incomingWebhooks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Webhook className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay webhooks entrantes configurados</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => {
                      setWebhookType('incoming')
                      setShowCreateDialog(true)
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Crear primer webhook
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Ultimo trigger</TableHead>
                      <TableHead className="w-[100px]">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incomingWebhooks.map((webhook) => (
                      <TableRow key={webhook.id}>
                        <TableCell className="font-medium">{webhook.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{webhook.event}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-2 py-1 rounded max-w-[200px] truncate">
                              {webhook.url}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => copyToClipboard(webhook.url)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          {webhook.status === 'active' ? (
                            <Badge className="bg-green-500/15 text-green-600 border-green-500/20">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Activo
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <XCircle className="h-3 w-3 mr-1" />
                              Inactivo
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(webhook.lastTriggered).toLocaleDateString('es-AR')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outgoing" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Webhooks salientes</CardTitle>
              <CardDescription>
                Envia notificaciones a URLs externas cuando ocurren eventos en la plataforma.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {outgoingWebhooks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ArrowUpFromLine className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay webhooks salientes configurados</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => {
                      setWebhookType('outgoing')
                      setShowCreateDialog(true)
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Crear primer webhook
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>URL destino</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Ultimo envio</TableHead>
                      <TableHead className="w-[100px]">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outgoingWebhooks.map((webhook) => (
                      <TableRow key={webhook.id}>
                        <TableCell className="font-medium">{webhook.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{webhook.event}</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-1 rounded max-w-[200px] truncate block">
                            {webhook.url}
                          </code>
                        </TableCell>
                        <TableCell>
                          {webhook.status === 'active' ? (
                            <Badge className="bg-green-500/15 text-green-600 border-green-500/20">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Activo
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <XCircle className="h-3 w-3 mr-1" />
                              Inactivo
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(webhook.lastTriggered).toLocaleDateString('es-AR')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Webhook Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Crear webhook</DialogTitle>
            <DialogDescription>
              Configura un nuevo webhook para recibir o enviar datos.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Select value={webhookType} onValueChange={(v) => setWebhookType(v as 'incoming' | 'outgoing')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="incoming">
                    <div className="flex items-center gap-2">
                      <ArrowDownToLine className="h-4 w-4" />
                      Entrante (Trigger)
                    </div>
                  </SelectItem>
                  <SelectItem value="outgoing">
                    <div className="flex items-center gap-2">
                      <ArrowUpFromLine className="h-4 w-4" />
                      Saliente
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="webhook-name">Nombre</Label>
              <Input
                id="webhook-name"
                value={newWebhookName}
                onChange={(e) => setNewWebhookName(e.target.value)}
                placeholder="Ej: Notificar nuevo lead"
              />
            </div>
            {webhookType === 'outgoing' && (
              <div className="grid gap-2">
                <Label htmlFor="webhook-url">URL destino</Label>
                <Input
                  id="webhook-url"
                  value={newWebhookUrl}
                  onChange={(e) => setNewWebhookUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label>Evento</Label>
              <Select value={newWebhookEvent} onValueChange={setNewWebhookEvent}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar evento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead.created">Nuevo lead</SelectItem>
                  <SelectItem value="task.created">Tarea creada</SelectItem>
                  <SelectItem value="task.completed">Tarea completada</SelectItem>
                  <SelectItem value="client.created">Cliente creado</SelectItem>
                  <SelectItem value="time_entry.created">Entrada de tiempo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateWebhook}>
              <Plus className="h-4 w-4 mr-2" />
              Crear webhook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
