import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Converts URLs in text to clickable <a> tags
 * Handles http://, https://, and www. URLs
 */
export function linkifyText(text: string): string {
  // Regular expression to match URLs
  const urlRegex = /(?:https?:\/\/|www\.)[^\s<>"{}|\\^`\[\]]*[^\s<>"{}|\\^`\[\].,;:!?()"']/gi
  
  return text.replace(urlRegex, (url) => {
    // Add https:// if only www. is present
    const href = url.startsWith('www.') ? `https://${url}` : url
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:opacity-80">${url}</a>`
  })
}
