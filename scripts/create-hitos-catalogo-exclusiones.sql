-- Permite desactivar un hito del catálogo para un cliente puntual (ej: ADT)
-- sin afectar al resto de los clientes del mismo plan (ej: Biblos).
-- generateMonthInstances() debe excluir estos pares cliente_id + hito_id
-- al generar instancias nuevas cada mes.
CREATE TABLE IF NOT EXISTS hitos_catalogo_exclusiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  hito_id UUID NOT NULL REFERENCES hitos_catalogo(id) ON DELETE CASCADE,
  creado_por UUID REFERENCES colaboradores(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cliente_id, hito_id)
);

ALTER TABLE hitos_catalogo_exclusiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura autenticada" ON hitos_catalogo_exclusiones;
CREATE POLICY "Lectura autenticada"
ON hitos_catalogo_exclusiones
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Escritura autenticada" ON hitos_catalogo_exclusiones;
CREATE POLICY "Escritura autenticada"
ON hitos_catalogo_exclusiones
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');
