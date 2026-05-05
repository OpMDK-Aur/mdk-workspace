import { NextRequest, NextResponse } from 'next/server'

const DISCORD_API = 'https://discord.com/api/v10'
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN

export async function GET(request: NextRequest) {
  const channelId = request.nextUrl.searchParams.get('channelId')
  const limit = request.nextUrl.searchParams.get('limit') || '50'

  if (!channelId) {
    return NextResponse.json({ error: 'channelId is required' }, { status: 400 })
  }

  if (!BOT_TOKEN) {
    return NextResponse.json({ error: 'Discord bot token not configured' }, { status: 500 })
  }

  try {
    const response = await fetch(`${DISCORD_API}/channels/${channelId}/messages?limit=${limit}`, {
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('[v0] Discord API error:', error)
      return NextResponse.json({ error: error.message || 'Failed to fetch messages' }, { status: response.status })
    }

    const messages = await response.json()
    
    // Transform messages to a simpler format
    const transformedMessages = messages.map((msg: {
      id: string
      content: string
      author: { id: string; username: string; avatar: string | null; bot?: boolean }
      timestamp: string
      attachments?: { url: string; filename: string }[]
    }) => ({
      id: msg.id,
      content: msg.content,
      author: {
        id: msg.author.id,
        username: msg.author.username,
        avatar: msg.author.avatar 
          ? `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png`
          : null,
        isBot: msg.author.bot || false,
      },
      timestamp: msg.timestamp,
      attachments: msg.attachments?.map((a: { url: string; filename: string }) => ({ url: a.url, filename: a.filename })) || [],
    })).reverse() // Reverse to show oldest first

    return NextResponse.json({ messages: transformedMessages })
  } catch (error) {
    console.error('[v0] Discord fetch error:', error)
    return NextResponse.json({ error: 'Failed to connect to Discord' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { channelId, content, senderName } = await request.json()
  
  console.log('[v0] Discord POST - received:', { channelId, content, senderName })

  if (!channelId || !content) {
    return NextResponse.json({ error: 'channelId and content are required' }, { status: 400 })
  }

  if (!BOT_TOKEN) {
    return NextResponse.json({ error: 'Discord bot token not configured' }, { status: 500 })
  }

  // Format message with sender name if provided
  const formattedContent = senderName 
    ? `**${senderName}:** ${content}`
    : content
  
  console.log('[v0] Discord POST - formatted content:', formattedContent)

  try {
    const response = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: formattedContent }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('[v0] Discord send error:', error)
      return NextResponse.json({ error: error.message || 'Failed to send message' }, { status: response.status })
    }

    const message = await response.json()
    return NextResponse.json({ 
      message: {
        id: message.id,
        content: message.content,
        author: {
          id: message.author.id,
          username: message.author.username,
          avatar: message.author.avatar 
            ? `https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}.png`
            : null,
          isBot: message.author.bot || false,
        },
        timestamp: message.timestamp,
        attachments: message.attachments?.map((a: { url: string; filename: string }) => ({ url: a.url, filename: a.filename })) || [],
      }
    })
  } catch (error) {
    console.error('[v0] Discord send error:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
