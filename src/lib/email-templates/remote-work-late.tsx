import React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  collaboratorName?: string
  dates?: string[]
  dayPart?: string
  location?: string
  workKind?: string
  noticeDays?: number
  policyDate?: string
  lateReason?: string | null
  notes?: string | null
}

const Email = ({
  collaboratorName,
  dates = [],
  dayPart,
  location,
  workKind,
  noticeDays = 1,
  policyDate,
  lateReason,
  notes,
}: Props) => (
  <Html lang="pt" dir="ltr">
    <Head />
    <Preview>
      Pedido de trabalho remoto fora de prazo — {collaboratorName ?? 'colaborador'}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Pedido de trabalho remoto fora de prazo</Heading>
        <Section style={badge}>
          <Text style={badgeText}>PEDIDO FORA DE PRAZO</Text>
        </Section>
        <Text style={text}>
          {collaboratorName ?? 'Um colaborador'} pediu trabalho remoto com menos
          de {noticeDays} dia(s) de antecedência. A política exige o pedido até{' '}
          {policyDate ?? 'ao dia anterior'}. O pedido está pendente da tua
          aprovação.
        </Text>
        <Hr style={hr} />
        <Row label="Colaborador" value={collaboratorName ?? '—'} />
        <Row label="Dia(s)" value={dates.join(', ') || '—'} />
        <Row label="Período" value={dayPart ?? '—'} />
        <Row label="Local" value={location ?? '—'} />
        <Row label="Tipo de trabalho" value={workKind ?? '—'} />
        <Row label="Justificação" value={lateReason || '—'} />
        <Row label="Nota" value={notes || '—'} />
        <Hr style={hr} />
        <Text style={muted}>
          Registado no PSA Hub como pedido fora de prazo, em HR → Trabalho
          remoto.
        </Text>
      </Container>
    </Body>
  </Html>
)

const Row = ({ label, value }: { label: string; value: string }) => (
  <Text style={text}>
    <span style={{ color: '#6b7280' }}>{label}: </span>
    <span style={{ fontWeight: 600 }}>{value}</span>
  </Text>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Trabalho remoto fora de prazo — ${data['collaboratorName'] ?? 'colaborador'}`,
  displayName: 'Remote work — late request',
  previewData: {
    collaboratorName: 'Ana Silva',
    dates: ['2026-09-15'],
    dayPart: 'Dia completo',
    location: 'Casa',
    workKind: 'Home office',
    noticeDays: 1,
    policyDate: '2026-09-16',
    lateReason: 'Entrega de obra adiada esta manhã.',
    notes: null,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '20px', margin: '0 0 12px', color: '#111827' }
const badge = {
  display: 'inline-block',
  backgroundColor: '#fef3c7',
  borderRadius: '4px',
  padding: '4px 10px',
  margin: '0 0 12px',
}
const badgeText = {
  margin: '0',
  fontSize: '11px',
  letterSpacing: '0.08em',
  color: '#92400e',
  fontWeight: 700,
}
const text = { fontSize: '14px', lineHeight: '22px', color: '#111827', margin: '6px 0' }
const muted = { fontSize: '12px', lineHeight: '18px', color: '#6b7280', margin: '6px 0' }
const hr = { borderColor: '#e5e7eb', margin: '16px 0' }
