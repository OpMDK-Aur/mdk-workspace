'use client'

import { useId, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ChatAdPlatform = 'meta' | 'google'
export type ChatAdAccountSelection = Record<ChatAdPlatform, string[]>

export type ChatAdAccountClient = {
  id: string
  meta_ads_account_id?: string | null
  meta_ads_account_ids?: string[] | string | null
  google_ads_customer_id?: string | null
  google_ads_customer_ids?: string[] | string | null
  cuentas_publicitarias?: Array<{
    id_cuenta: string | null
    nombre_cuenta: string | null
    plataforma: string | null
    activo?: boolean | null
  }> | null
} | null

type ChatAdAccountOption = { id: string; platform: ChatAdPlatform; name: string }

const PLATFORMS: Array<{ key: ChatAdPlatform; label: string }> = [
  { key: 'meta', label: 'Meta Ads' },
  { key: 'google', label: 'Google Ads' },
]

function parseIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(parseIds)
  if (typeof value !== 'string') return []
  return value.split(',').map((id) => id.trim()).filter(Boolean)
}

function normalizeAccountId(platform: ChatAdPlatform, value: string) {
  return platform === 'meta' ? value.trim().replace(/^act_/, '') : value.trim().replace(/-/g, '')
}

function getClientAdAccounts(client: ChatAdAccountClient): ChatAdAccountOption[] {
  if (!client) return []

  const accounts = new Map<string, ChatAdAccountOption>()
  const add = (platform: ChatAdPlatform, rawId: string, rawName?: string | null) => {
    const id = normalizeAccountId(platform, rawId)
    if (!id) return
    const key = `${platform}:${id}`
    const name = rawName?.trim() && rawName.trim() !== rawId ? rawName.trim() : `${platform === 'meta' ? 'Meta Ads' : 'Google Ads'} · ${id}`
    const existing = accounts.get(key)
    if (!existing || (existing.name === `${platform === 'meta' ? 'Meta Ads' : 'Google Ads'} · ${id}` && name !== existing.name)) {
      accounts.set(key, { id, platform, name })
    }
  }

  for (const account of client.cuentas_publicitarias ?? []) {
    if (account.activo === false || (account.plataforma !== 'meta' && account.plataforma !== 'google')) continue
    const ids = parseIds(account.id_cuenta)
    ids.forEach((id) => add(account.plataforma as ChatAdPlatform, id, ids.length === 1 ? account.nombre_cuenta : null))
  }

  const legacyAccounts: Array<{ platform: ChatAdPlatform; single: unknown; plural: unknown }> = [
    { platform: 'meta', single: client.meta_ads_account_id, plural: client.meta_ads_account_ids },
    { platform: 'google', single: client.google_ads_customer_id, plural: client.google_ads_customer_ids },
  ]
  for (const { platform, single, plural } of legacyAccounts) {
    const values = parseIds(plural).length ? parseIds(plural) : parseIds(single)
    values.forEach((id) => add(platform, id))
  }

  return [...accounts.values()].sort((a, b) => PLATFORMS.findIndex((item) => item.key === a.platform) - PLATFORMS.findIndex((item) => item.key === b.platform) || a.name.localeCompare(b.name, 'es'))
}

export function ChatAdAccountSelector({
  client,
  selected,
  onChange,
  disabled = false,
}: {
  client: ChatAdAccountClient
  selected: ChatAdAccountSelection
  onChange: (selection: ChatAdAccountSelection) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const accounts = useMemo(() => getClientAdAccounts(client), [client])
  const selectedCount = selected.meta.length + selected.google.length
  const triggerLabel = selectedCount ? `${selectedCount} cuenta${selectedCount === 1 ? '' : 's'} seleccionada${selectedCount === 1 ? '' : 's'}` : 'Elegir cuentas'

  function toggleAccount(platform: ChatAdPlatform, accountId: string) {
    const current = selected[platform]
    const next = current.includes(accountId) ? current.filter((id) => id !== accountId) : [...current, accountId]
    onChange({ ...selected, [platform]: next })
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Cuentas publicitarias: ${triggerLabel}`}
        className={cn(
          'flex h-8 max-w-[240px] items-center gap-2 rounded-full border px-3 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
          selectedCount ? 'border-[#5b5fe8] bg-[#eeefff] text-[#5b5fe8]' : 'border-[#dededb] bg-white text-[#333] hover:border-[#5b5fe8]',
        )}
      >
        <span className="truncate">Ads · {triggerLabel}</span>
        <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
      </button>
      {open && !disabled && (
        <>
          <button type="button" aria-label="Cerrar selector de cuentas" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div id={listId} role="group" aria-label="Selección de cuentas publicitarias" className="absolute right-0 top-10 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-[#dededb] bg-white p-3 shadow-xl">
            <p className="text-[11px] font-semibold text-[#141414]">Cuentas de Ads para este análisis</p>
            <p className="mt-1 text-[10px] leading-4 text-[#777]">Marcá solo las cuentas que querés consultar. Las cuentas de Ads no marcadas no se consultan.</p>
            {accounts.length ? (
              <div className="mt-3 flex flex-col gap-3">
                {PLATFORMS.map(({ key, label }) => {
                  const platformAccounts = accounts.filter((account) => account.platform === key)
                  if (!platformAccounts.length) return null
                  return (
                    <fieldset key={key} className="flex flex-col gap-1">
                      <legend className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#777]">{label}</legend>
                      {platformAccounts.map((account) => (
                        <label key={`${key}:${account.id}`} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-[11px] text-[#222] hover:bg-[#f5f5f3]">
                          <input
                            type="checkbox"
                            checked={selected[key].includes(account.id)}
                            onChange={() => toggleAccount(key, account.id)}
                            className="size-4 shrink-0 accent-[#5b5fe8]"
                          />
                          <span className="min-w-0 flex-1 truncate" title={account.name}>{account.name}</span>
                          <span className="shrink-0 font-mono text-[9px] text-[#999]">{account.id}</span>
                        </label>
                      ))}
                    </fieldset>
                  )
                })}
              </div>
            ) : (
              <p className="mt-3 rounded-lg bg-[#f5f5f3] px-3 py-2 text-[11px] leading-5 text-[#777]">Este cliente no tiene cuentas activas de Meta Ads o Google Ads vinculadas.</p>
            )}
            <p className="mt-3 border-t border-[#eee] pt-2 text-[10px] leading-4 text-[#777]">
              {selectedCount ? `${selectedCount} cuenta${selectedCount === 1 ? '' : 's'} seleccionada${selectedCount === 1 ? '' : 's'}. GA4 y CRM siguen disponibles si están conectados.` : 'Sin cuentas de Ads seleccionadas. GA4 y CRM solo se podrán usar si están conectados.'}
            </p>
            <button type="button" onClick={() => setOpen(false)} className="mt-2 w-full rounded-lg px-2 py-1.5 text-left text-[10px] font-semibold text-[#5b5fe8] hover:bg-[#f5f5f3]">Listo</button>
          </div>
        </>
      )}
    </div>
  )
}
