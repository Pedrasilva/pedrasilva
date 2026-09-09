import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Row,
  Column,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

export interface ExpenseApprovedProps {
  collaboratorName?: string
  collaboratorNumber?: string | null
  category?: string
  description?: string
  date?: string
  amount?: string
  collaboratorNotes?: string | null
  approvalNotes?: string | null
  photoUrl?: string | null
}

const label: React.CSSProperties = {
  color: '#666666',
  fontSize: '13px',
  padding: '6px 12px 6px 0',
  width: '140px',
  verticalAlign: 'top',
}

const value: React.CSSProperties = {
  color: '#1a1a1a',
  fontSize: '14px',
  padding: '6px 0',
}

export function ExpenseApprovedEmail({
  collaboratorName = '—',
  collaboratorNumber = null,
  category = '—',
  description = '—',
  date = '—',
  amount = '—',
  collaboratorNotes = null,
  approvalNotes = null,
  photoUrl = null,
}: ExpenseApprovedProps) {
  return (
    <Html lang="pt">
      <Head />
      <Preview>{`Despesa aprovada — ${collaboratorName} — ${amount}`}</Preview>
      <Body style={{ backgroundColor: '#f6f6f6', fontFamily: 'Arial, sans-serif', margin: 0 }}>
        <Container style={{ backgroundColor: '#ffffff', maxWidth: '560px', padding: '32px' }}>
          <Heading style={{ fontSize: '20px', margin: '0 0 12px', color: '#111111' }}>
            Despesa aprovada para pagamento
          </Heading>
          <Text style={{ margin: '0 0 20px', color: '#555555', fontSize: '14px' }}>
            A despesa abaixo foi aprovada e está pronta para processamento.
          </Text>
          <Section>
            <Row>
              <Column style={label}>Colaborador</Column>
              <Column style={value}>
                <strong>{collaboratorName}</strong>
                {collaboratorNumber ? ` (#${collaboratorNumber})` : ''}
              </Column>
            </Row>
            <Row>
              <Column style={label}>Categoria</Column>
              <Column style={value}>{category}</Column>
            </Row>
            <Row>
              <Column style={label}>Descrição</Column>
              <Column style={value}>{description}</Column>
            </Row>
            <Row>
              <Column style={label}>Data</Column>
              <Column style={value}>{date}</Column>
            </Row>
            <Row>
              <Column style={label}>Valor</Column>
              <Column style={value}>
                <strong>{amount}</strong>
              </Column>
            </Row>
            {collaboratorNotes ? (
              <Row>
                <Column style={label}>Notas</Column>
                <Column style={value}>{collaboratorNotes}</Column>
              </Row>
            ) : null}
            {approvalNotes ? (
              <Row>
                <Column style={label}>Aprovação</Column>
                <Column style={value}>{approvalNotes}</Column>
              </Row>
            ) : null}
          </Section>
          {photoUrl ? (
            <Section style={{ marginTop: '24px' }}>
              <Button
                href={photoUrl}
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
                Ver factura
              </Button>
              <Text style={{ color: '#999999', fontSize: '11px', marginTop: '10px' }}>
                Link válido por 7 dias.
              </Text>
            </Section>
          ) : null}
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ExpenseApprovedEmail,
  displayName: 'Despesa aprovada',
  subject: (data: Record<string, any>) =>
    `[Benefícios] Despesa aprovada — ${data.collaboratorName ?? ''} — ${data.amount ?? ''}`,
  previewData: {
    collaboratorName: 'Maria Silva',
    collaboratorNumber: '42',
    category: 'Ticket / Cartão refeição',
    description: 'Almoço com cliente',
    date: '09/09/2026',
    amount: '24,50 €',
    collaboratorNotes: 'Reunião de projeto',
    approvalNotes: 'Aprovado',
    photoUrl: 'https://example.com/receipt.jpg',
  },
} satisfies TemplateEntry
