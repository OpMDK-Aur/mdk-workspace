import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Increase body size limit to 50MB
export const config = {
  api: {
    bodyParser: false,
  },
}

export const runtime = 'nodejs'

export async function POST(request: Request) {
  console.log('[v0] Upload API called')
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      console.log('[v0] No file in request')
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Check file size (max 50MB)
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File too large. Maximum size is 50MB' }, { status: 413 })
    }

    console.log('[v0] File received:', file.name, file.type, file.size)
    const supabase = await createClient()

    // Generate unique filename
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 8)
    const extension = file.name.split('.').pop() || 'bin'
    const fileName = `${timestamp}-${randomStr}.${extension}`

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('task-files')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (error) {
      console.error('[v0] Supabase upload error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('[v0] Upload success, getting public URL')
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('task-files')
      .getPublicUrl(fileName)

    return NextResponse.json({ 
      url: publicUrl,
      fileName: file.name,
      mimeType: file.type,
    })
  } catch (error) {
    console.error('[v0] Error uploading file:', error)
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }
}
