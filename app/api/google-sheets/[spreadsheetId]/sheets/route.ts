import { NextRequest, NextResponse } from 'next/server'

// GET /api/google-sheets/[spreadsheetId]/sheets - List sheets in a spreadsheet
// Works with public spreadsheets using API key
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ spreadsheetId: string }> }
) {
  const { spreadsheetId } = await params
  
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_API_KEY no configurada' }, { status: 500 })
  }

  try {
    // Use API key for public spreadsheets (no OAuth needed)
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties&key=${apiKey}`,
    )

    if (!res.ok) {
      const errorData = await res.json()
      const errorMessage = errorData.error?.message || 'Error fetching sheets'
      
      // Provide user-friendly error messages
      if (res.status === 404) {
        return NextResponse.json({ error: 'Spreadsheet no encontrado. Verifica la URL.' }, { status: 404 })
      }
      if (res.status === 403) {
        return NextResponse.json({ error: 'El spreadsheet no es publico. Compartilo como "Cualquier persona con el enlace puede ver".' }, { status: 403 })
      }
      
      return NextResponse.json({ error: errorMessage }, { status: res.status })
    }

    const data = await res.json()

    return NextResponse.json({
      spreadsheetId,
      title: data.properties?.title,
      sheets: data.sheets?.map((s: { properties: { sheetId: number; title: string; index: number } }) => ({
        sheetId: s.properties.sheetId,
        title: s.properties.title,
        index: s.properties.index,
      })) ?? [],
    })
  } catch (err) {
    console.error('[google-sheets] Error fetching sheets:', err)
    return NextResponse.json({ error: 'Error fetching sheets' }, { status: 500 })
  }
}
