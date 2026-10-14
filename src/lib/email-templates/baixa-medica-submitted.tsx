import * as React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

/** Certified sick leave submitted — notification to accounting / HR (no action implied). */
export interface BaixaMedicaProps {
  collaboratorName?: string
  startDate?: string
  endDate?: string
  submittedAt?: string
  certificateUrl?: string | null
}

export function BaixaMedicaSubmittedEmail({
  collaboratorName = '—',
  startDate = '',
  endDate = '',
  submittedAt = '',
  certificateUrl = null,
}: BaixaMedicaProps) {
  return (
    <Html lang="pt">
      <Head />
      <Preview>{`Baixa médica submetida — ${collaboratorName}`}</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', margin: 0 }}>
        <Container style={{ maxWidth: '560px', padding: '32px' }}>
          <Heading style={{ fontSize: '20px', margin: '0 0 12px', color: '#111111' }}>
            Baixa médica submetida
          </Heading>
          <Text style={txt}>Colaborador: {collaboratorName}</Text>
          <Text style={txt}>Período: {startDate} → {endDate}</Text>
          {submittedAt ? <Text style={txt}>Submetida em: {submittedAt}</Text> : null}
          <Text style={txt}>Para informação — não é necessária nenhuma ação.</Text>
          {certificateUrl ? (
            <Section style={{ marginTop: '16px' }}>
              <Button href={certificateUrl} style={btn}>Ver certificado</Button>
              <Text style={{ color: '#999999', fontSize: '11px', marginTop: '8px' }}>
                Link válido durante 7 dias.
              </Text>
            </Section>
          ) : null}
          <Text style={{ color: '#999999', fontSize: '11px', marginTop: '24px' }}>
            Mensagem automática do PSA Hub. Não responda a este email.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const txt = { margin: '0 0 8px', color: '#333333', fontSize: '14px' }
const btn = {
  backgroundColor: '#111111',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '14px',
  padding: '10px 16px',
  textDecoration: 'none',
}

export const template = {
  component: BaixaMedicaSubmittedEmail,
  displayName: 'Ausências — baixa médica submetida',
  subject: (data: Record<string, any>) => `Baixa médica submetida — ${data.collaboratorName ?? '—'}`,
  previewData: {
    collaboratorName: 'Rita Saragoça',
    startDate: '12/10/2026',
    endDate: '16/10/2026',
    submittedAt: '14/10/2026',
    certificateUrl: 'https://example.com/certificado.pdf',
  },
} satisfies TemplateEntry
