/** Export plain text as a .md download. Mirrors BackupPanel's Blob approach. */
export function downloadMarkdown(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/** sharkweb-prompt-YYYY-MM-DD-HHmm.md */
export function markdownFilename(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`
  return `sharkweb-prompt-${date}-${time}.md`
}
