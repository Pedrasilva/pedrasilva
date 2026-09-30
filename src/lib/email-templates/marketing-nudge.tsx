import * as React from 'react'
import { Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

export interface MarketingNudgeProps {
  senderName?: string
  projectName?: string
  question?: string
  thumbs?: string[]
  answerUrl?: string
}

export function MarketingNudgeEmail({
  senderName = '—',
  projectName = '—',
  question = '',
  thumbs = [],
  answerUrl = 'https://pedrasilva.lovable.app',
}: MarketingNudgeProps) {
  return (
    <Html lang="pt">
      <Head />
      <Preview>{`${senderName} perguntou sobre ${projectName}`}</Preview>
      <Body style={{ backgroundColor: '#f6f6f6', fontFamily: 'Arial, sans-serif', margin: 0 }}>
        <Container style={{ backgroundColor: '#ffffff', maxWidth: '560px', padding: '32px' }}>
          <Heading style={{ fontSize: '20px', margin: '0 0 12px', color: '#111111' }}>
            {`${senderName} perguntou sobre ${projectName}`}
          </Heading>
          <Text style={{ fontSize: '16px', color: '#1a1a1a', lineHeight: '24px' }}>{question}</Text>
          {thumbs.length > 0 && (
            <Section style={{ margin: '12px 0' }}>
              {thumbs.slice(0, 2).map((src) => (
                <Img key={src} src={src} width="240" alt="" style={{ display: 'inline-block', marginRight: '8px', borderRadius: '4px' }} />
              ))}
            </Section>
          )}
          <Button href={answerUrl} style={{ backgroundColor: '#111111', color: '#ffffff', padding: '12px 20px', borderRadius: '4px', fontSize: '14px' }}>
            Responder no PSA Hub · Answer in PSA Hub
          </Button>
          <Text style={{ fontSize: '12px', color: '#666666', marginTop: '16px' }}>
            Pode responder por nota de voz ou texto. · You can answer by voice note or text.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: MarketingNudgeEmail,
  subject: (d: Record<string, any>) => `${d.senderName ?? 'PSA Hub'} perguntou sobre ${d.projectName ?? 'um projeto'}`,
  displayName: 'Marketing context question',
  previewData: { senderName: 'Adalberto', projectName: 'Apartamento ST', question: 'O que foi discutido na visita de ontem?', thumbs: [], answerUrl: 'https://pedrasilva.lovable.app/nudges/x' },
} satisfies TemplateEntry
