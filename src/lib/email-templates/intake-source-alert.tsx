import * as React from 'react';
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components';
import type { TemplateEntry } from './registry';

function Email({ source = '', message = '', kind = 'failures' }: { source?: string; message?: string; kind?: string }) {
  const title = kind === 'silence'
    ? `Sem documentos de ${source} · Nothing received from ${source}`
    : `Falhas na recolha de ${source} · ${source} intake failing`;
  return (
    <Html lang="pt">
      <Head />
      <Preview>{title}</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Arial,sans-serif' }}>
        <Container style={{ padding: '32px', maxWidth: '560px' }}>
          <Heading style={{ fontSize: '20px' }}>{title}</Heading>
          <Text>{message}</Text>
          <Button href="https://pedrasilva.lovable.app/finance/admin/imports"
            style={{ backgroundColor: '#111111', color: '#ffffff', padding: '12px 20px', borderRadius: '4px' }}>
            Ver recolhas · Open imports
          </Button>
        </Container>
      </Body>
    </Html>
  );
}

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => d.kind === 'silence'
    ? `PSA Hub: sem documentos de ${d.source ?? 'uma origem'}`
    : `PSA Hub: falhas na recolha de ${d.source ?? 'uma origem'}`,
  displayName: 'Intake source alert',
  previewData: { source: 'docs@pedrasilva.com', message: '3 recolhas seguidas falharam.', kind: 'failures' },
} satisfies TemplateEntry;
