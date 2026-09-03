"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Loader2, Check, X } from "lucide-react";
import { generateMonthInstances } from "@/lib/service-map";
import type { HitoCatalogo } from "@/lib/types";

export function ServiceMapMilestoneEditor() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<HitoCatalogo[]>([]);
  const [clientId, setClientId] = useState("");
  const [clients, setClients] = useState<
    Array<{ id: string; nombre_del_negocio: string; plan?: string | null }>
  >([]);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingHitoId, setAddingHitoId] = useState("");
  const [addFeedback, setAddFeedback] = useState<{ error: boolean } | null>(
    null,
  );
  const [removeFeedback, setRemoveFeedback] = useState<{
    id: string;
    error: boolean;
  } | null>(null);
  const [currentMilestones, setCurrentMilestones] = useState<
    Array<{
      id: string;
      hito_id: string;
      tarea_id?: string | null;
      mes: number;
      anio: number;
      estado: string;
      hito: {
        id: string;
        nombre: string;
        frecuencia: string;
        tipo_servicio: string;
      } | null;
    }>
  >([]);
  const [loadingCurrent, setLoadingCurrent] = useState(false);
  const [assignedHitoIds, setAssignedHitoIds] = useState<Set<string>>(new Set());

  const loadCurrentMilestones = useCallback(
    async (id: string) => {
      setLoadingCurrent(true);
      const now = new Date();
      const [{ data }, { data: assigned }] = await Promise.all([
        supabase
          .from("mapa_servicio_instancias")
          .select(
            "id, hito_id, tarea_id, mes, anio, estado, hito:hitos_catalogo(id, nombre, frecuencia, tipo_servicio)",
          )
          .eq("cliente_id", id)
          .eq("mes", now.getMonth() + 1)
          .eq("anio", now.getFullYear())
          .order("mes"),
        supabase
          .from("mapa_servicio_instancias")
          .select("hito_id")
          .eq("cliente_id", id),
      ]);
      setCurrentMilestones((data ?? []) as unknown as typeof currentMilestones);
      setAssignedHitoIds(new Set((assigned ?? []).map((item) => item.hito_id).filter(Boolean)));
      setLoadingCurrent(false);
    },
    [supabase],
  );

  useEffect(() => {
    if (clientId) void loadCurrentMilestones(clientId);
    else {
      setCurrentMilestones([]);
      setAssignedHitoIds(new Set());
    }
  }, [clientId, loadCurrentMilestones]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("hitos_catalogo")
      .select("*")
      .order("tipo_servicio")
      .order("orden");
    setItems((data ?? []) as HitoCatalogo[]);
    const { data: clientData } = await supabase
      .from("clientes")
      .select("id, nombre_del_negocio, plan")
      .order("nombre_del_negocio");
    setClients(clientData ?? []);
  }, [supabase]);
  useEffect(() => {
    void load();
  }, [load]);

  const selectedClient = clients.find((client) => client.id === clientId);
  const normalizePlan = (value?: string | null) =>
    value
      ?.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  const clientPlan = normalizePlan(selectedClient?.plan);
  const currentHitoIds = new Set(
    currentMilestones.map((instance) => instance.hito_id).filter(Boolean),
  );
  // Debe reflejar exactamente la regla de generateMonthInstances: un cliente
  // en plan Esencial solo recibe hitos tipo_servicio="esencial"; cualquier
  // otro plan (Estratégico, ADT, etc.) recibe TODO el catálogo (esenciales +
  // estratégicos). Por eso el desplegable no debe filtrar por tipo cuando el
  // plan no es Esencial.
  const isClientPlanHito = (item: HitoCatalogo) => {
    if (!clientPlan) return true;
    if (clientPlan === "esencial")
      return normalizePlan(item.tipo_servicio) === "esencial";
    return true;
  };
  const planHitos = items.filter(
    (item) => isClientPlanHito(item) && !assignedHitoIds.has(item.id),
  );
  const addBaseHito = async (item: HitoCatalogo) => {
    if (!clientId) return;
    setSaving(true);
    setAddingHitoId(item.id);
    setAddFeedback(null);
    // Si este hito había sido excluido antes para este cliente, lo
    // reincorporamos quitando la exclusión antes de regenerar la instancia.
    await supabase
      .from("hitos_catalogo_exclusiones")
      .delete()
      .eq("cliente_id", clientId)
      .eq("hito_id", item.id);
    const now = new Date();
    const result = await generateMonthInstances(
      clientId,
      now.getMonth() + 1,
      now.getFullYear(),
      (selectedClient?.plan ?? item.tipo_servicio) as any,
    );
    setSaving(false);
    setAddingHitoId("");
    if (!result.success) {
      setAddFeedback({ error: true });
      setTimeout(() => setAddFeedback(null), 1800);
      return;
    }
    setAddFeedback({ error: false });
    setTimeout(() => setAddFeedback(null), 1800);
    await loadCurrentMilestones(clientId);
  };
  const removeCurrent = async (
    instance: (typeof currentMilestones)[number],
  ) => {
    setSaving(true);
    if (instance.tarea_id)
      await supabase.from("tareas").delete().eq("id", instance.tarea_id);
    const { error } = await supabase
      .from("mapa_servicio_instancias")
      .delete()
      .eq("id", instance.id);
    if (!error) {
      // Registramos la exclusión para que este hito no se vuelva a generar
      // para este cliente en los próximos meses (aunque siga activo en el
      // catálogo para el resto de los clientes del mismo plan).
      await supabase.from("hitos_catalogo_exclusiones").upsert(
        { cliente_id: clientId, hito_id: instance.hito_id },
        { onConflict: "cliente_id,hito_id" },
      );
    }
    setSaving(false);
    if (error) {
      setRemoveFeedback({ id: instance.id, error: true });
      setTimeout(() => setRemoveFeedback(null), 1800);
      return;
    }
    setRemoveFeedback({ id: instance.id, error: false });
    setTimeout(() => {
      setCurrentMilestones((prev) =>
        prev.filter((entry) => entry.id !== instance.id),
      );
      setRemoveFeedback(null);
    }, 1400);
  };
  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Administrar hitos</CardTitle>
            <CardDescription>
              Seleccioná un cliente para personalizar sus hitos. Los cambios se
              aplican desde el mes corriente.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={clientId || "all"}
              onValueChange={(value) =>
                setClientId(value === "all" ? "" : value)
              }
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Seleccionar cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Seleccionar cliente</SelectItem>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.nombre_del_negocio}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Select
                value={addingHitoId || "none"}
                onValueChange={setAddingHitoId}
                disabled={!clientId || saving}
              >
                <SelectTrigger className="w-56">
                  <SelectValue
                    placeholder={
                      clientId ? "Elegí un hito base" : "Elegí un cliente"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Elegí un hito base</SelectItem>
                  {planHitos.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => {
                  const item = planHitos.find(
                    (candidate) => candidate.id === addingHitoId,
                  );
                  if (item) void addBaseHito(item);
                }}
                disabled={
                  !clientId ||
                  !addingHitoId ||
                  addingHitoId === "none" ||
                  saving
                }
              >
                {saving && addingHitoId ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  "Agregar"
                )}
              </Button>
              {addFeedback && (
                <span
                  className={`flex items-center gap-1 text-xs font-medium animate-in fade-in-0 zoom-in-95 ${addFeedback.error ? "text-destructive" : "text-[#ff4b3e]"}`}
                >
                  {addFeedback.error ? (
                    <X className="size-3.5" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  {addFeedback.error ? "Error" : "Agregado"}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {notice && (
          <p className="text-sm text-muted-foreground">{notice}</p>
        )}
        <section
          className="rounded-xl border bg-muted/20 p-4"
          aria-labelledby="client-current-map-heading"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 id="client-current-map-heading" className="font-semibold">
                Hitos activos del mes corriente
              </h3>
              <p className="text-sm text-muted-foreground">
                Seleccioná un cliente para ver cómo está configurado hoy.
              </p>
            </div>
            {clientId && (
              <Badge variant="secondary">
                {new Date().toLocaleDateString("es-AR", {
                  month: "long",
                  year: "numeric",
                })}
              </Badge>
            )}
          </div>
          {!clientId ? (
            <div className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Elegí un cliente arriba para cargar sus hitos actuales.
            </div>
          ) : loadingCurrent ? (
            <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border p-6 text-sm text-muted-foreground">
              <Loader2 className="animate-spin" />
              Cargando hitos actuales...
            </div>
          ) : currentMilestones.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Este cliente no tiene hitos generados para el mes corriente.
            </div>
          ) : (
            <ul className="mt-4 flex flex-col divide-y rounded-lg border bg-background">
              {currentMilestones.map((instance) => (
                <li
                  key={instance.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className="mt-1 size-2 shrink-0 rounded-full bg-[#ff4b3e]"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <h4 className="font-semibold text-foreground">
                        {instance.hito?.nombre ?? "Hito sin catálogo"}
                      </h4>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {instance.hito?.tipo_servicio ?? "Sin plan"} ·{" "}
                        {instance.hito?.frecuencia ?? "Sin frecuencia"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:shrink-0">
                    <Badge
                      className="border-[#ff4b3e]/30 bg-[#fff1ef] text-[#e3342f]"
                      variant="outline"
                    >
                      {instance.estado ?? "pendiente"}
                    </Badge>
                    {removeFeedback?.id === instance.id ? (
                      <span
                        className={`flex items-center gap-1 text-xs font-medium animate-in fade-in-0 zoom-in-95 ${removeFeedback.error ? "text-destructive" : "text-[#ff4b3e]"}`}
                      >
                        {removeFeedback.error ? (
                          <X className="size-3.5" />
                        ) : (
                          <Check className="size-3.5" />
                        )}
                        {removeFeedback.error ? "Error" : "Quitado"}
                      </span>
                    ) : (
                      <Button
                        className="border-[#ff4b3e] text-[#e3342f] hover:bg-[#fff1ef] hover:text-[#c92a25]"
                        variant="outline"
                        size="sm"
                        onClick={() => void removeCurrent(instance)}
                        disabled={saving}
                      >
                        <Trash2 data-icon="inline-start" />
                        Borrar
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
