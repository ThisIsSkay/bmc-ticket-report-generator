import { toBlob, toJpeg, toPng } from 'html-to-image'

const exportOptions = {
  cacheBust: true,
  backgroundColor: '#ffffff',
  pixelRatio: 1.5,
  width: 1800,
  height: 950,
} as const

function downloadDataUrl(dataUrl: string, fileName: string): void {
  const link = document.createElement('a')
  link.download = fileName
  link.href = dataUrl
  link.click()
}

export async function saveReportAsJpeg(node: HTMLElement, date: string): Promise<void> {
  const dataUrl = await toJpeg(node, { ...exportOptions, quality: 0.96 })
  downloadDataUrl(dataUrl, `BMC_Ticket_Report_${date}.jpg`)
}

export async function saveReportAsPng(node: HTMLElement, date: string): Promise<void> {
  const dataUrl = await toPng(node, exportOptions)
  downloadDataUrl(dataUrl, `BMC_Ticket_Report_${date}.png`)
}

export async function copyReportToClipboard(node: HTMLElement): Promise<void> {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    throw new Error('Image clipboard is not supported by this browser.')
  }
  const blob = await toBlob(node, { ...exportOptions, pixelRatio: 1.25 })
  if (!blob) throw new Error('The report image could not be created.')
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

export async function printReport(node: HTMLElement): Promise<void> {
  const printWindow = window.open('', '_blank')
  if (!printWindow) throw new Error('Pop-up blocking prevented the print window from opening.')
  printWindow.document.write('<p style="font-family:Arial,sans-serif">Preparing report…</p>')
  const dataUrl = await toPng(node, { ...exportOptions, pixelRatio: 1.2 })
  printWindow.document.open()
  printWindow.document.write(`<!doctype html><html><head><title>BMC Ticket Report</title><style>
    @page { size: landscape; margin: 6mm; }
    html, body { margin: 0; padding: 0; background: #fff; }
    img { display: block; width: 100%; height: auto; }
  </style></head><body><img src="${dataUrl}" onload="window.print()" /></body></html>`)
  printWindow.document.close()
}
