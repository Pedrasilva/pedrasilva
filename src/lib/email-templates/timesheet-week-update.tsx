import * as React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

/** Weekly timesheet workflow email — mirrors the bell notification. */
export interface TimesheetWeekUpdateProps {
  title?: string
  body?: string | null
  url?: string
}

export function TimesheetWeekUpdateEmail({
  title = 'Folha de horas semanal',
  body,
  url = 'https://pedrasilva.lovable.app/projects/timesheet',
}: TimesheetWeekUpdateProps) {
  return (
    <Html lang="pt">
      <Head />
      <Preview>{title}</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', margin: 0 }}>
        <Container style={{ maxWidth: '560px', padding: '32px' }}>
          <Heading style={{ fontSize: '20px', margin: '0 0 12px', color: '#111111' }}>{title}</Heading>
          {body ? (
            <Text style={{ margin: '0 0 24px', color: '#333333', fontSize: '14px', whiteSpace: 'pre-wrap' }}>
              {body}
            </Text>
          ) : null}
          <Section>
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
              Abrir semana
            </Button>
          </Section>
          <Text style={{ color: '#999999', fontSize: '11px', marginTop: '24px' }}>
            Mensagem automática do PSA Hub.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: TimesheetWeekUpdateEmail,
  displayName: 'Folha de horas semanal — atualização',
  subject: (data: Record<string, any>) => String(data.title ?? 'Folha de horas semanal'),
  previewData: {
    title: 'Semana submetida: Rita Saragoça',
    body: 'Semana de 28/09/2026 aguarda aprovação',
    url: 'https://pedrasilva.lovable.app/projects/weekly-approval',
  },
} satisfies TemplateEntry
