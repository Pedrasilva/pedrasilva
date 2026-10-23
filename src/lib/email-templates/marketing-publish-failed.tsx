import * as React from 'react';
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components';
import type { TemplateEntry } from './registry';
function Email({reason='',draftUrl='https://pedrasilva.lovable.app/marketing/posts'}:{reason?:string;draftUrl?:string}){
 return <Html lang="pt"><Head/><Preview>Falha na publicação Instagram · Instagram publishing failed</Preview><Body style={{backgroundColor:'#ffffff',fontFamily:'Arial,sans-serif'}}><Container style={{padding:'32px',maxWidth:'560px'}}><Heading>Falha na publicação Instagram · Instagram publishing failed</Heading><Text>{reason}</Text><Button href={draftUrl} style={{backgroundColor:'#111111',color:'#ffffff',padding:'12px 20px',borderRadius:'4px'}}>Abrir publicação · Open post</Button></Container></Body></Html>;
}
export const template={component:Email,subject:'Falha na publicação Instagram · Instagram publishing failed',displayName:'Instagram publishing failure',previewData:{reason:'Media validation failed',draftUrl:'https://pedrasilva.lovable.app/marketing/posts'}} satisfies TemplateEntry;
