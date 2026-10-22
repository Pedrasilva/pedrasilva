import * as React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

export interface MarketingPostApprovalProps {
  kind?: 'request' | 'approved' | 'changes_requested'
  senderName?: string
  excerpt?: string
  comment?: string
  draftUrl?: string
}

const HEADINGS = {
  request: 'Pedido de aprovação de publicação · Post approval request',
  approved: 'Publicação aprovada · Post approved',
  changes_requested: 'Pedidas alterações · Changes requested',
}

export function MarketingPostApprovalEmail({ kind = 'request', senderName = '—', excerpt = '', comment = '', draftUrl = 'https://pedrasilva.lovable.app/marketing/posts' }: MarketingPostApprovalProps) {
  const heading = HEADINGS[kind] ?? HEADINGS.request
  return (
    <Html lang="pt">
      <Head />
      <Preview>{`${senderName}: ${heading}`}</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', margin: 0 }}>
        <Container style={{ backgroundColor: '#ffffff', maxWidth: '560px', padding: '32px' }}>
          <Text style={{ fontSize: '13px', color: '#666666', margin: '0 0 4px' }}>{senderName}</Text>
          <Heading style={{ fontSize: '20px', margin: '0 0 12px', color: '#111111' }}>{heading}</Heading>
          {excerpt && <Text style={{ fontSize: '15px', color: '#1a1a1a', lineHeight: '22px', whiteSpace: 'pre-wrap' }}>{excerpt}</Text>}
          {comment && <Text style={{ fontSize: '14px', color: '#1a1a1a', borderLeft: '3px solid #cccccc', paddingLeft: '10px' }}>{comment}</Text>}
          <Button href={draftUrl} style={{ backgroundColor: '#111111', color: '#ffffff', padding: '12px 20px', borderRadius: '4px', fontSize: '14px' }}>
            Abrir publicação · Open post
          </Button>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: MarketingPostApprovalEmail,
  subject: (d: Record<string, unknown>) => HEADINGS[(d.kind as keyof typeof HEADINGS) ?? 'request'] ?? HEADINGS.request,
  displayName: 'Marketing post approval',
  previewData: { kind: 'request', senderName: 'Luis', excerpt: 'Uma nova perspetiva sobre o atelier…', comment: '', draftUrl: 'https://pedrasilva.lovable.app/marketing/posts' },
} satisfies TemplateEntry
