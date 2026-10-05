import * as React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

export interface FinanceForwardProps {
  entityName?: string | null
  entityNif?: string | null
  issuer?: string | null
  date?: string | null
  filename?: string | null
  link?: string
}

export function FinanceForwardEmail({ entityName, entityNif, issuer, date, filename, link = '#' }: FinanceForwardProps) {
  const who = [entityName, entityNif ? `(${entityNif})` : null].filter(Boolean).join(' ') || '—'
  return (
    <Html lang="pt">
      <Head />
      <Preview>{`Documento para ${who}`}</Preview>
      <Body style={{ backgroundColor: '#f6f6f6', fontFamily: 'Arial, sans-serif', margin: 0 }}>
        <Container style={{ backgroundColor: '#ffffff', maxWidth: '560px', padding: '32px' }}>
          <Heading style={{ fontSize: '20px', margin: '0 0 12px', color: '#111111' }}>Documento recebido para {who}</Heading>
          <Text style={{ color: '#555555', fontSize: '14px' }}>
            Este documento chegou à caixa financeira da Pedra Silva mas está dirigido a {who}.
          </Text>
          <Text style={{ color: '#555555', fontSize: '14px' }}>
            {issuer ? `Emitente: ${issuer}` : ''}{date ? ` · Data: ${date}` : ''}{filename ? ` · ${filename}` : ''}
          </Text>
          <Button href={link} style={{ backgroundColor: '#111111', color: '#ffffff', padding: '10px 16px', borderRadius: '4px', fontSize: '14px' }}>
            Descarregar documento
          </Button>
          <Text style={{ color: '#999999', fontSize: '12px', marginTop: '20px' }}>A ligação é válida durante 14 dias.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: FinanceForwardEmail,
  subject: (d: Record<string, any>) => `Documento para ${d.entityName ?? 'outra entidade'}`,
  displayName: 'Finance — forward to other entity',
  previewData: { entityName: 'Pedra Rioja SA', entityNif: '513789898', issuer: 'BCP', date: '2026-09-30', filename: 'aviso.pdf', link: 'https://example.com' },
} satisfies TemplateEntry
