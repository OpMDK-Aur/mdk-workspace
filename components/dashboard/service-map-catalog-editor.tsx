"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Save, Trash2, Loader2, Check, X, Pencil } from "lucide-react";
import type { FrecuenciaHito, HitoCatalogo, TipoServicio } from "@/lib/types";
import { checkHitoHasFutureInstances } from "@/lib/service-map";

type CatalogHito = HitoCatalogo & { activo: boolean };
type Draft = Omit<CatalogHito, "id">;

const blankDraft: Draft = {
  nombre: "",
  descripcion: null,
  orden: 1,
  tipo_servicio: "esencial",
  frecuencia: "Mensual",
  genera_tarea: true,
  requiere_link_drive: false,
  checklist_esencial: null,
  checklist_estrategico: null,
  activo: true,
};

const FRECUENCIAS: FrecuenciaHito[] = [
  "Mensual",
  "Bimestral",
  "Semanal",
  "Semanal (Lun)",
  "Semanal (Vie)",
  "2 Veces x Sem",
];

const PLAN_OPTIONS: { value: string; label: string }[] = [
  { value: "todos", label: "Todos los planes" },
  { value: "esencial", label: "Esencial" },
  { value: "estrategico", label: "Estratégico" },
];

export function ServiceMapCatalogEditor() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<CatalogHito[]>([]);
  const [loading, setLoading] = useState(true);
  const [planFilter, setPlanFilter] = useState("todos");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [rowFeedback, setRowFeedback] = useState<{
    id: string;
    error: boolean;
  } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [hasFutureInstances, setHasFutureInstances] = useState(false);
  const [checkingFuture, setCheckingFuture] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("hitos_catalogo")
      .select("*")
      .order("tipo_servicio")
      .order("orden");
    if (error) setNotice(`No se pudo cargar el catálogo: ${error.message}`);
    setItems((data ?? []) as CatalogHito[]);
    setLoading(false);
  }, [supabase]);
  useEffect(() => {
    void load();
  }, [load]);

  // Un cliente en plan Estratégico recibe TODOS los hitos (esenciales + estratégicos),
  // ya que generateMonthInstances no filtra por tipo cuando el plan no es Esencial.
  // Por eso el filtro "Estratégico" acá muestra el set completo, igual que en Biblos.
  const filteredItems = items.filter(
    (item) =>
      planFilter === "todos" ||
      planFilter === "estrategico" ||
      item.tipo_servicio === planFilter,
  );
  const planLabel =
    PLAN_OPTIONS.find((option) => option.value === planFilter)?.label ??
    "todos los planes";

  const startCreate = () => {
    setEditingId("new");
    setDraft({
      ...blankDraft,
      tipo_servicio: planFilter === "estrategico" ? "estrategico" : "esencial",
    });
    setNotice("");
  };
  const startEdit = (item: CatalogHito) => {
    setEditingId(item.id);
    setDraft({ ...item });
    setNotice("");
  };
  const cancelEdit = () => {
    setEditingId(null);
    setDraft(blankDraft);
    setNotice("");
  };

  const saveDraft = async () => {
    if (!draft.nombre.trim())
      return setNotice("El nombre del hito es obligatorio.");
    setSaving(true);
    const payload = {
      ...draft,
      nombre: draft.nombre.trim(),
      descripcion: draft.descripcion?.trim() || null,
    };
    const query =
      editingId && editingId !== "new"
        ? supabase.from("hitos_catalogo").update(payload).eq("id", editingId)
        : supabase.from("hitos_catalogo").insert(payload);
    const { error } = await query;
    setSaving(false);
    if (error) return setNotice(`No se pudo guardar: ${error.message}`);
    setNotice(
      editingId && editingId !== "new" ? "Hito actualizado." : "Hito creado.",
    );
    cancelEdit();
    await load();
  };

  const requestDelete = async (item: CatalogHito) => {
    setCheckingFuture(true);
    const hasInstances = await checkHitoHasFutureInstances(item.id);
    setCheckingFuture(false);
    setHasFutureInstances(hasInstances);
    setConfirmDeleteId(item.id);
  };
  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    setSaving(true);
    const id = confirmDeleteId;
    const { error } = await supabase
      .from("hitos_catalogo")
      .delete()
      .eq("id", id);
    setSaving(false);
    setConfirmDeleteId(null);
    if (error) {
      setRowFeedback({ id, error: true });
      setTimeout(() => setRowFeedback(null), 1800);
      return;
    }
    setRowFeedback({ id, error: false });
    setTimeout(async () => {
      setRowFeedback(null);
      await load();
    }, 900);
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>Administrar hitos base</CardTitle>
            <CardDescription>
              Catálogo maestro de hitos por plan. Los cambios acá no
              modifican instancias ya generadas para clientes.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAN_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={startCreate} disabled={saving}>
              <Plus data-icon="inline-start" />
              Nuevo hito
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

        {editingId && (
          <section className="rounded-xl border bg-muted/20 p-4">
            <h3 className="font-semibold">
              {editingId === "new" ? "Nuevo hito base" : "Editar hito base"}
            </h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm">
                Nombre
                <Input
                  value={draft.nombre}
                  onChange={(e) =>
                    setDraft({ ...draft, nombre: e.target.value })
                  }
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                Orden
                <Input
                  type="number"
                  value={draft.orden}
                  onChange={(e) =>
                    setDraft({ ...draft, orden: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <label className="mt-4 flex flex-col gap-2 text-sm">
              Descripción
              <Textarea
                value={draft.descripcion ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, descripcion: e.target.value })
                }
                rows={2}
              />
            </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm">
                Plan
                <Select
                  value={draft.tipo_servicio}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      tipo_servicio: value as TipoServicio,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="esencial">Esencial</SelectItem>
                    <SelectItem value="estrategico">Estratégico</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="flex flex-col gap-2 text-sm">
                Frecuencia
                <Select
                  value={draft.frecuencia}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      frecuencia: value as FrecuenciaHito,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FRECUENCIAS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.genera_tarea}
                  onCheckedChange={(checked) =>
                    setDraft({ ...draft, genera_tarea: checked === true })
                  }
                />
                Genera tarea
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.requiere_link_drive}
                  onCheckedChange={(checked) =>
                    setDraft({
                      ...draft,
                      requiere_link_drive: checked === true,
                    })
                  }
                />
                Requiere link de Drive
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.activo}
                  onCheckedChange={(checked) =>
                    setDraft({ ...draft, activo: checked === true })
                  }
                />
                Activo
              </label>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Button onClick={() => void saveDraft()} disabled={saving}>
                {saving ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Save data-icon="inline-start" />
                )}
                {saving ? "Guardando..." : "Guardar"}
              </Button>
              <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                Cancelar
              </Button>
            </div>
          </section>
        )}

        <section
          className="rounded-xl border bg-muted/20 p-4"
          aria-labelledby="catalog-list-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 id="catalog-list-heading" className="font-semibold">
                Catálogo de hitos
              </h3>
              <p className="text-sm text-muted-foreground">
                {filteredItems.length} hito
                {filteredItems.length === 1 ? "" : "s"} en {planLabel}
              </p>
            </div>
            <Badge variant="secondary">{planLabel}</Badge>
          </div>
          {loading ? (
            <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border p-6 text-sm text-muted-foreground">
              <Loader2 className="animate-spin" />
              Cargando catálogo...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No hay hitos base para este plan todavía.
            </div>
          ) : (
            <ul className="mt-4 flex flex-col divide-y rounded-lg border bg-background">
              {filteredItems.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`mt-1 size-2 shrink-0 rounded-full ${item.activo ? "bg-[#ff4b3e]" : "bg-muted-foreground/40"}`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <h4 className="font-semibold text-foreground">
                        {item.nombre}
                      </h4>
                      <p className="mt-1 text-sm text-muted-foreground capitalize">
                        {item.tipo_servicio} · {item.frecuencia}
                        {!item.activo ? " · Inactivo" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:shrink-0">
                    {rowFeedback?.id === item.id ? (
                      <span
                        className={`flex items-center gap-1 text-xs font-medium animate-in fade-in-0 zoom-in-95 ${rowFeedback.error ? "text-destructive" : "text-[#ff4b3e]"}`}
                      >
                        {rowFeedback.error ? (
                          <X className="size-3.5" />
                        ) : (
                          <Check className="size-3.5" />
                        )}
                        {rowFeedback.error ? "Error" : "Borrado"}
                      </span>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEdit(item)}
                          disabled={saving}
                        >
                          <Pencil data-icon="inline-start" />
                          Editar
                        </Button>
                        <Button
                          className="border-[#ff4b3e] text-[#e3342f] hover:bg-[#fff1ef] hover:text-[#c92a25]"
                          variant="outline"
                          size="sm"
                          onClick={() => void requestDelete(item)}
                          disabled={saving || checkingFuture}
                        >
                          <Trash2 data-icon="inline-start" />
                          Borrar
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>

      <AlertDialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar este hito base?</AlertDialogTitle>
            <AlertDialogDescription>
              {hasFutureInstances
                ? "Este hito ya generó instancias para clientes. Borrarlo del catálogo no elimina esas instancias existentes, pero deja de generarse en meses futuros."
                : "Esta acción quita el hito del catálogo maestro. No afecta instancias ya generadas."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : "Borrar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
