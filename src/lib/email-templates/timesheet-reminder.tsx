import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

export interface TimesheetReminderProps {
  /** Display name of the person who still owes hours. */
  name?: string
  /** Week label, e.g. "1 – 7 Set 2026". */
  weekLabel?: string
  /** Hours already recorded for that week, formatted. */
  recordedHours?: string
  /** Their normal weekly capacity, formatted. */
  capacityHours?: string
  /** Absolute link to the timesheet page. */
  timesheetUrl?: string
  /** 'pt' (default) or 'en'. */
  language?: 'pt' | 'en'
}

const COPY = {
  pt: {
    preview: (week: string) => `Faltam horas na semana ${week}`,
    heading: 'Registo de horas em falta',
    intro: (name: string, week: string) =>
      `Olá ${name}, a folha de horas da semana ${week} ainda não foi submetida.`,
    status: (rec: string, cap: string) =>
      `Registaste ${rec} de ${cap} de capacidade semanal normal.`,
    ask: 'Quando tiveres um momento, completa e submete a semana para que possa ser aprovada.',
    cta: 'Abrir folha de horas',
    footer: 'Mensagem automática do PSA Hub.',
  },
  en: {
    preview: (week: string) => `Hours still missing for week ${week}`,
    heading: 'Your hours are still open',
    intro: (name: string, week: string) =>
      `Hi ${name}, your timesheet for the week of ${week} has not been submitted yet.`,
    status: (rec: string, cap: string) =>
      `You have recorded ${rec} out of your normal weekly capacity of ${cap}.`,
    ask: 'When you have a moment, complete the week and submit it so it can be approved.',
    cta: 'Open my timesheet',
    footer: 'Automatic message from PSA Hub.',
  },
} as const

export function TimesheetReminderEmail({
  name = '—',
  weekLabel = '—',
  recordedHours = '0h',
  capacityHours = '40h',
  timesheetUrl = 'https://pedrasilva.lovable.app/projects/timesheet',
  language = 'pt',
}: TimesheetReminderProps) {
  const c = COPY[language === 'en' ? 'en' : 'pt']
  return (
    <Html lang={language === 'en' ? 'en' : 'pt'}>
      <Head />
      <Preview>{c.preview(weekLabel)}</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', margin: 0 }}>
        <Container style={{ maxWidth: '560px', padding: '32px' }}>
          <Heading style={{ fontSize: '20px', margin: '0 0 12px', color: '#111111' }}>
            {c.heading}
          </Heading>
          <Text style={{ margin: '0 0 8px', color: '#333333', fontSize: '14px' }}>
            {c.intro(name, weekLabel)}
          </Text>
          <Text style={{ margin: '0 0 8px', color: '#555555', fontSize: '14px' }}>
            {c.status(recordedHours, capacityHours)}
          </Text>
          <Text style={{ margin: '0 0 24px', color: '#555555', fontSize: '14px' }}>{c.ask}</Text>
          <Section>
            <Button
              href={timesheetUrl}
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
              {c.cta}
            </Button>
          </Section>
          <Text style={{ color: '#999999', fontSize: '11px', marginTop: '24px' }}>{c.footer}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: TimesheetReminderEmail,
  displayName: 'Lembrete de registo de horas',
  subject: (data: Record<string, any>) =>
    data.language === 'en'
      ? `Timesheet reminder — week of ${data.weekLabel ?? ''}`
      : `Lembrete: folha de horas da semana ${data.weekLabel ?? ''}`,
  previewData: {
    name: 'Maria Silva',
    weekLabel: '1 – 7 Set 2026',
    recordedHours: '22h',
    capacityHours: '40h',
    timesheetUrl: 'https://pedrasilva.lovable.app/projects/timesheet',
    language: 'pt',
  },
} satisfies TemplateEntry
