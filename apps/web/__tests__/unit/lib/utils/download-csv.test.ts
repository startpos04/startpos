/**
 * download-csv.test.ts
 *
 * Tests for downloadCsv using jsdom (already configured in vitest.config.ts).
 * We spy on DOM APIs (URL.createObjectURL, link.click, appendChild/removeChild)
 * to verify the function drives the browser download mechanics correctly
 * without actually triggering a file download.
 *
 * Coverage:
 *  - Creates a Blob with text/csv content type
 *  - Creates an object URL from the Blob
 *  - Creates a hidden <a> element with the correct href and download attribute
 *  - Appends the link to body, clicks it, then removes it
 *  - Revokes the object URL after download
 *  - Filename is set correctly on the link
 *
 * Run with: pnpm test
 */

import { downloadCsv } from '@/lib/utils/download-csv'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('downloadCsv', () => {
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>
  let appendChildSpy: ReturnType<typeof vi.spyOn>
  let removeChildSpy: ReturnType<typeof vi.spyOn>
  let clickSpy: ReturnType<typeof vi.spyOn>
  let setAttributeSpy: ReturnType<typeof vi.spyOn>

  let createdLink: HTMLAnchorElement | null = null

  beforeEach(() => {
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url-123')
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    // Capture the link element that gets created
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag)
      if (tag === 'a') {
        createdLink = el as HTMLAnchorElement
        clickSpy = vi.spyOn(el, 'click').mockImplementation(() => {})
        setAttributeSpy = vi.spyOn(el, 'setAttribute')
      }
      return el
    })

    appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(node => node)
    removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(node => node)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    createdLink = null
  })

  it('calls URL.createObjectURL with a Blob of type text/csv', () => {
    downloadCsv('a,b\n1,2', 'test.csv')

    expect(createObjectURLSpy).toHaveBeenCalledOnce()
    const blob = createObjectURLSpy.mock.calls[0]![0] as Blob
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('text/csv;charset=utf-8;')
  })

  it('sets link href to the object URL returned by createObjectURL', () => {
    downloadCsv('a,b\n1,2', 'test.csv')
    expect(createdLink?.href).toContain('blob:mock-url-123')
  })

  it('sets the download attribute to the provided filename', () => {
    downloadCsv('col1,col2\nval1,val2', 'my-export.csv')
    expect(setAttributeSpy).toHaveBeenCalledWith('download', 'my-export.csv')
  })

  it('appends the link to document.body before clicking', () => {
    downloadCsv('data', 'file.csv')
    expect(appendChildSpy).toHaveBeenCalledBefore(clickSpy as any)
  })

  it('clicks the link to trigger the download', () => {
    downloadCsv('data', 'file.csv')
    expect(clickSpy).toHaveBeenCalledOnce()
  })

  it('removes the link from document.body after clicking', () => {
    downloadCsv('data', 'file.csv')
    expect(removeChildSpy).toHaveBeenCalledOnce()
  })

  it('revokes the object URL after the download', () => {
    downloadCsv('data', 'file.csv')
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url-123')
  })

  it('works with an empty CSV string', () => {
    expect(() => downloadCsv('', 'empty.csv')).not.toThrow()
  })

  it('works with a multi-row CSV string', () => {
    const csv = 'Name,Age\nAlice,30\nBob,25'
    downloadCsv(csv, 'people.csv')

    const blob = createObjectURLSpy.mock.calls[0]![0] as Blob
    expect(blob.size).toBeGreaterThan(0)
  })
})
