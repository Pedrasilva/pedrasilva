import * as React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

/** Leave change request / decision email — mirrors the bell notification. */
export interface LeaveChangeProps {
  title?: string
  lines?: string[]
  url?: string
}

export function LeaveChangeEmail({
  title = 'Ausência',
  lines = [],
  url = 'https://pedrasilva.lovable.app/hr/ferias',
}: LeaveChangeProps) {
  return (
    <Html lang="pt">
      <Head />
      <Preview>{title}</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', margin: 0 }}>
        <Container style={{ maxWidth: '560px', padding: '32px' }}>
          <Heading style={{ fontSize: '20px', margin: '0 0 12px', color: '#111111' }}>{title}</Heading>
          {lines.map((l, i) => (
            <Text key={i} style={{ margin: '0 0 8px', color: '#333333', fontSize: '14px', whiteSpace: 'pre-wrap' }}>
              {l}
            </Text>
          ))}
          <Section style={{ marginTop: '16px' }}>
            <Button
              href={url}
              style={{
                backgroundColor: '#111111',
                borderRadius: '6px',
                color: '#ffffff',
                display: 'inline-block',
                fontSize: '14px',
                padding: '10px 16px',
                textDecoration: 'none',
              }}
            >
              Abrir pedido
            </Button>
          </Section>
          <Text style={{ color: '#999999', fontSize: '11px', marginTop: '24px' }}>
            Mensagem automática do PSA Hub. Não responda a este email.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: LeaveChangeEmail,
  displayName: 'Ausências — pedido de alteração',
  subject: (data: Record<string, any>) => String(data.title ?? 'Ausência'),
  previewData: {
    title: 'Pedido de alteração de ausência: Rita Saragoça',
    lines: ['Original: Férias, 2026-08-03 → 2026-08-14', 'Proposta: alterar datas para 2026-08-10 → 2026-08-21', 'Explicação: mudança de planos'],
    url: 'https://pedrasilva.lovable.app/hr/ferias',
  },
} satisfies TemplateEntry
