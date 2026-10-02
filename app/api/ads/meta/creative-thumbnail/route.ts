import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdCreative } from '@/lib/meta-ads/service'
import { creativeThumbnail } from '@/lib/meta/to-creative-card'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adId = request.nextUrl.searchParams.get('ad_id') ?? ''
  if (!/^\d{1,30}$/.test(adId)) return NextResponse.json({ error: 'ad_id inválido.' }, { status: 400 })

  try {
    const creative = await getAdCreative(adId)
    return NextResponse.json({ thumbnail: creativeThumbnail(creative) })
  } catch (error) {
    console.error('[v0] Creative thumbnail refresh failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ thumbnail: null }, { status: 502 })
  }
}
