/**
 * Map Upload Component
 * 
 * Initial state when no map is uploaded.
 * Shows upload button/area in the center.
 * 
 * AI Note: In production, this would handle actual file uploads
 * (PDF, DXF, SVG, images) and process them.
 */

'use client'

import { Upload, Map as MapIcon, Loader2, AlertCircle } from 'lucide-react'
import { useState, useRef } from 'react'
import { useSite } from '@/lib/SiteContext'
import { pdfToImage, isPdfFile } from '@/lib/pdfUtils'
import type { ExtractedVectorData } from '@/lib/pdfVectorExtractor'
import { storeVectorData, storeImage } from '@/lib/indexedDB'
import { useAdvancedSettings } from '@/lib/AppearanceContext'
import { Button } from '@/components/ui/Button'

interface MapUploadProps {
  onMapUpload: (imageUrl: string, locationName: string) => void
  onVectorDataUpload?: (vectorData: ExtractedVectorData, locationName: string) => void
}

export function MapUpload({ onMapUpload, onVectorDataUpload }: MapUploadProps) {
  const { activeSiteId } = useSite()
  const { enableSVGExtraction } = useAdvancedSettings()
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [locationName, setLocationName] = useState('Main Floor Plan')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Helper to get site-scoped localStorage key
  const getStorageKey = () => {
    return activeSiteId ? `fusion_map-image-url_${activeSiteId}` : 'map-image-url'
  }

  const handleFileSelect = async (file: File) => {
    // Reset error state
    setError(null)

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'application/pdf']
    const validExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.pdf']
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))

    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
      setError('Please upload a valid image file (PNG, JPG, SVG) or PDF')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024 // 50MB
    if (file.size > maxSize) {
      setError('File size must be less than 50MB. Please choose a smaller file.')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    setIsProcessing(true)
    setProcessingStatus('Analyzing PDF structure...')

    try {
      let base64String: string | undefined = undefined

      // Handle PDF files - convert to high-res image
      if (isPdfFile(file)) {
        try {
          // Convert PDF to high-res image
          setProcessingStatus('Rendering PDF to high-resolution image (this may take a moment)...')
          base64String = await pdfToImage(file, 6)
        } catch (pdfError) {
          console.error('PDF processing error:', pdfError)
          throw new Error(
            pdfError instanceof Error
              ? `Failed to process PDF: ${pdfError.message}`
              : 'Failed to process PDF. Please ensure the file is a valid PDF.'
          )
        }
      } else {
        // Handle regular image files
        setProcessingStatus('Reading image file...')
        base64String = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => {
            const result = reader.result as string
            if (result) {
              resolve(result)
            } else {
              reject(new Error('Failed to read file'))
            }
          }
          reader.onerror = () => {
            reject(new Error('Error reading file'))
          }
          reader.readAsDataURL(file)
        })
      }

      // Store image data - use IndexedDB for large images to avoid localStorage quota
      setProcessingStatus('Saving map data...')
      const storageKey = getStorageKey()
      const IMAGE_SIZE_THRESHOLD = 100000 // ~100KB - store larger images in IndexedDB

      if (base64String.length > IMAGE_SIZE_THRESHOLD && activeSiteId) {
        // Large image - store in IndexedDB
        try {
          // Convert base64 to Blob
          const response = await fetch(base64String)
          const blob = await response.blob()

          // Store in IndexedDB
          const imageId = await storeImage(
            activeSiteId,
            blob,
            file.name,
            blob.type || 'image/png'
          )

          // Store only the reference in localStorage
          const reference = `indexeddb:${imageId}`
          localStorage.setItem(storageKey, reference)

          // Return the data URL for immediate use (it's already in memory)
          onMapUpload(base64String, locationName)
        } catch (error) {
          console.error('Failed to store image in IndexedDB:', error)
          // Fallback: try to store in localStorage anyway (might fail if too large)
          try {
            localStorage.setItem(storageKey, base64String)
            onMapUpload(base64String, locationName)
          } catch (storageError) {
            throw new Error('Image is too large to store. Please use a smaller image or clear browser storage.')
          }
        }
      } else {
        // Small image - can store in localStorage
        try {
          localStorage.setItem(storageKey, base64String)
          onMapUpload(base64String, locationName)
        } catch (error) {
          // If localStorage fails, try IndexedDB as fallback
          if (activeSiteId && base64String.length > 0) {
            try {
              const response = await fetch(base64String)
              const blob = await response.blob()
              const imageId = await storeImage(
                activeSiteId,
                blob,
                file.name,
                blob.type || 'image/png'
              )
              const reference = `indexeddb:${imageId}`
              localStorage.setItem(storageKey, reference)
              onMapUpload(base64String, locationName)
            } catch (indexedDBError) {
              throw new Error('Failed to save image. Storage may be full. Please clear browser storage and try again.')
            }
          } else {
            throw error
          }
        }
      }

      setProcessingStatus('Complete!')

      // Reset input after successful upload
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      console.error('File processing error:', err)
      setError(
        err instanceof Error
          ? err.message
          : 'An error occurred while processing the file. Please try again.'
      )
      setProcessingStatus('')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } finally {
      // Small delay to show "Complete!" message
      setTimeout(() => {
        setIsProcessing(false)
        setProcessingStatus('')
      }, 500)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
      // Reset the input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleUpload = (e?: React.MouseEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    if (fileInputRef.current) {
      fileInputRef.current.click()
    } else {
      console.error('File input ref is not available')
      setError('File input is not ready. Please try again.')
    }
  }

  const handleLoadDefault = async () => {
    // Prevent double-clicks
    if (isProcessing) {
      console.log('Already processing, ignoring click')
      return
    }

    setIsProcessing(true)
    setError(null)
    setProcessingStatus('Loading sample floor plan...')

    try {
      // Load one of the sample PDF floor plans
      const samplePdfPath = '/floorplans/evacuation_map_i2systems.pdf'

      console.log('Fetching sample floor plan from:', samplePdfPath)

      // Fetch the PDF file with timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

      let response: Response
      try {
        response = await fetch(samplePdfPath, { signal: controller.signal })
        clearTimeout(timeoutId)
      } catch (fetchError) {
        clearTimeout(timeoutId)
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('Request timed out. Please check your network connection and try again.')
        }
        // Network errors (CORS, offline, etc.)
        console.error('Fetch failed:', fetchError)
        throw new Error('Network error: Unable to load the sample floor plan. Please try uploading a file manually.')
      }

      if (!response.ok) {
        console.error('Fetch response not OK:', response.status, response.statusText)
        throw new Error(`Failed to load sample floor plan (HTTP ${response.status}). Please try uploading a file manually.`)
      }

      setProcessingStatus('Processing PDF...')

      const blob = await response.blob()
      if (blob.size === 0) {
        throw new Error('Downloaded file is empty. Please try uploading a file manually.')
      }

      console.log('Downloaded blob size:', blob.size)

      const file = new File([blob], 'evacuation_map_i2systems.pdf', { type: 'application/pdf' })

      // Process it like a regular PDF upload
      await handleFileSelect(file)

    } catch (err) {
      console.error('Error loading sample floor plan:', err)
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load sample floor plan. Please try uploading manually.'
      )
      setIsProcessing(false)
      setProcessingStatus('')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
    // Reset input after drop
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-md w-full px-4">
        <div className="mb-8">
          <div className={`w-24 h-24 mx-auto mb-6 rounded-full bg-[var(--color-primary-soft)] flex items-center justify-center border-2 border-dashed transition-all ${isDragging ? 'border-[var(--color-primary)] scale-110' : 'border-[var(--color-primary)]/50'
            }`}>
            <MapIcon size={48} className="text-[var(--color-primary)]" />
          </div>
          <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">
            Upload Floor Plan
          </h2>
          <p className="text-[var(--color-text-muted)] mb-6">
            Upload a blueprint, floor plan, or drawing to visualize device locations
          </p>

          <div className="mb-6 text-left">
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
              Location Name
            </label>
            <input
              type="text"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
              placeholder="e.g. Main Floor Plan"
            />
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/svg+xml,application/pdf"
          onChange={handleFileInput}
          className="hidden"
        />

        {/* Error message */}
        {error && (
          <div className="mb-4 p-4 rounded-xl bg-[var(--color-danger-soft)] border border-[var(--color-danger)] flex items-start gap-3">
            <AlertCircle size={20} className="text-[var(--color-danger)] flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--color-danger)] mb-1">Upload Error</p>
              <p className="text-sm text-[var(--color-text-muted)]">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`mb-4 p-8 border-2 border-dashed rounded-xl transition-all ${isProcessing
            ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary-soft)]/30 opacity-60 cursor-wait'
            : isDragging
              ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]'
              : 'border-[var(--color-border-subtle)] hover:border-[var(--color-primary)]/50'
            }`}
        >
          {isProcessing ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={32} className="text-[var(--color-primary)] animate-spin" />
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm font-medium text-[var(--color-text)]">
                  {processingStatus || 'Processing file...'}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  This may take a moment for large files
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-[var(--color-text-muted)] mb-4">
                {isDragging ? 'Drop file here' : 'Drag and drop a file here, or'}
              </p>
              <Button
                type="button"
                onClick={handleUpload}
                disabled={isProcessing}
                variant="primary"
              >
                <Upload size={20} />
                Choose File
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1 h-px bg-[var(--color-border-subtle)]"></div>
          <span className="text-xs text-[var(--color-text-soft)]">OR</span>
          <div className="flex-1 h-px bg-[var(--color-border-subtle)]"></div>
        </div>

        <Button
          type="button"
          onClick={handleLoadDefault}
          disabled={isProcessing}
          variant="secondary"
          className="w-full mb-4"
        >
          Load Sample Evacuation Map
        </Button>

        <div className="text-sm text-[var(--color-text-soft)] space-y-1">
          <p>Supported formats: PNG, JPG, SVG, PDF</p>
          <p className="text-xs opacity-75">Max file size: 50MB • PDFs will be converted to images</p>
        </div>
      </div>
    </div>
  )
}

