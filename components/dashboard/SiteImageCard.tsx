'use client'

import { useState, useEffect } from 'react'
import { skipToken } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc/client'
import { Building2, Image as ImageIcon } from 'lucide-react'

export function SiteImageCard({ siteId, sizeClass = "w-24 h-24" }: { siteId: string; sizeClass?: string }) {
  const [displayUrl, setDisplayUrl] = useState<string | null>(null)

  const isValidSiteId = !!(siteId && typeof siteId === 'string' && siteId.length > 0)

  if (!isValidSiteId) {
    return (
      <div className={`flex-shrink-0 ${sizeClass} rounded-lg bg-gradient-to-br from-[var(--color-primary-soft)]/20 to-[var(--color-surface-subtle)] border border-[var(--color-border-subtle)] flex items-center justify-center`}>
        <div className="text-[var(--color-text-subtle)] text-xs">No Image</div>
      </div>
    )
  }

  const queryInput = isValidSiteId && siteId ? { siteId: String(siteId).trim() } : skipToken
  const { data: dbImage, isLoading: isDbLoading, isError: isDbError, refetch: refetchSiteImage } =
    trpc.image.getSiteImage.useQuery(queryInput, {
      enabled: isValidSiteId && !!siteId && siteId.trim().length > 0,
      retry: false,
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      staleTime: 0,
    })

  useEffect(() => {
    const loadImage = async () => {
      try {
        if (isDbLoading) return
        if (isDbError) return

        if (dbImage) {
          setDisplayUrl(dbImage)
          return
        }

        try {
          const { getSiteImage } = await import('@/lib/libraryUtils')
          const image = await getSiteImage(siteId)
          setDisplayUrl(image || null)
        } catch {
          setDisplayUrl(null)
        }
      } catch {
        setDisplayUrl(null)
      }
    }

    loadImage()

    const handleSiteImageUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ siteId: string }>
      if (!customEvent.detail || customEvent.detail?.siteId === siteId) {
        if (siteId) {
          const isTempId = /^site-\d+$/.test(siteId) || siteId.startsWith('temp-')
          const isRealDbId = siteId.length > 15 && !isTempId
          if (!isTempId && isRealDbId) {
            refetchSiteImage()
          }
        }
        loadImage()
      }
    }
    window.addEventListener('siteImageUpdated', handleSiteImageUpdate)
    return () => window.removeEventListener('siteImageUpdated', handleSiteImageUpdate)
  }, [siteId, dbImage, isDbLoading, isDbError, refetchSiteImage])

  return (
    <div
      className={`flex-shrink-0 ${sizeClass} rounded-lg bg-gradient-to-br from-[var(--color-primary-soft)]/20 to-[var(--color-surface-subtle)] border border-[var(--color-border-subtle)] flex items-center justify-center relative overflow-hidden`}
    >
      {displayUrl ? (
        <img
          src={displayUrl}
          alt="Site"
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        <>
          <Building2 size={32} className="text-[var(--color-primary)]/40" />
          <div className="absolute bottom-1 right-1">
            <div className="p-1 rounded bg-[var(--color-surface)]/80 backdrop-blur-sm border border-[var(--color-border-subtle)]">
              <ImageIcon size={10} className="text-[var(--color-text-muted)]" />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
