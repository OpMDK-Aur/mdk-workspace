import { experimental_generateImage as generateImage } from 'ai'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 120

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const { prompt } = await req.json()
    if (!prompt) {
      return Response.json({ error: 'Missing prompt' }, { status: 400 })
    }

    console.log('[v0] Generating image with prompt:', prompt.slice(0, 80))

    const { image } = await generateImage({
      model: 'openai/gpt-image-1',
      prompt,
      size: '1024x1024',
    })

    // image.base64 contains the generated image
    const dataUrl = `data:${image.mediaType || 'image/png'};base64,${image.base64}`

    return Response.json({ url: dataUrl })
  } catch (error) {
    console.error('[v0] Error generating image:', error)
    return Response.json({ error: 'Failed to generate image' }, { status: 500 })
  }
}
