export function downloadCsv(csvString: string, filename: string) {
  // No decoding needed! Just wrap the string in a Blob
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  // The 'download' attribute forces a download instead of opening a tab
  link.setAttribute('download', filename)

  document.body.appendChild(link)
  link.click()

  // Clean up
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
