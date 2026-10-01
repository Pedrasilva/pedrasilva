import * as React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

export interface MarketingActionProps {
  senderName?: string
  title?: string
  brief?: string
  dueDate?: string
  support?: boolean
  actionUrl?: string
}

export function MarketingActionEmail({
  senderName = '—',
  title = '',
  brief = '',
  dueDate = '',
  support = false,
  actionUrl = 'https://pedrasilva.lovable.app',
}: MarketingActionProps) {
  const heading = support ? `Apoio: ${title}` : title
  return (
    <Html lang="pt">
      <Head />
      <Preview>{`${senderName}: ${heading}`}</Preview>
      <Body style={{ backgroundColor: '#f6f6f6', fontFamily: 'Arial, sans-serif', margin: 0 }}>
        <Container style={{ backgroundColor: '#ffffff', maxWidth: '560px', padding: '32px' }}>
          <Text style={{ fontSize: '13px', color: '#666666', margin: '0 0 4px' }}>
            {support ? 'Nova ação de apoio · New support action' : 'Nova ação · New action'} — {senderName}
          </Text>
          <Heading style={{ fontSize: '20px', margin: '0 0 12px', color: '#111111' }}>{heading}</Heading>
          {dueDate && (
            <Text style={{ fontSize: '14px', color: '#1a1a1a', margin: '0 0 12px' }}>
              Prazo · Due: {dueDate}
            </Text>
          )}
          {brief && (
            <Text style={{ fontSize: '15px', color: '#1a1a1a', lineHeight: '22px', whiteSpace: 'pre-wrap' }}>{brief}</Text>
          )}
          <Button href={actionUrl} style={{ backgroundColor: '#111111', color: '#ffffff', padding: '12px 20px', borderRadius: '4px', fontSize: '14px' }}>
            Abrir ação · Open action
          </Button>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: MarketingActionEmail,
  subject: (d: Record<string, unknown>) => `${d.support ? 'Apoio: ' : 'Ação: '}${String(d.title ?? '')}`,
  displayName: 'Marketing action',
  previewData: { senderName: 'Adalberto', title: 'Entrevista aos fundadores', brief: 'Guião em anexo.', dueDate: '2026-10-15', support: false },
} satisfies TemplateEntry
