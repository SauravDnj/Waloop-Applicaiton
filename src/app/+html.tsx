/**
 * Web only: the root HTML of every statically rendered page — search and
 * share metadata (title, description, Open Graph / Twitter card with the share
 * image), theme colour and icons. Runs in Node at build time, not in the browser.
 * A route's own `generateMetadata()` title / description replaces these defaults.
 */
import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import { Children, isValidElement, type PropsWithChildren } from 'react';

const SITE = 'https://dialerapp.com.bot';
const TITLE = 'Inbox And Campaigns — WhatsApp inbox, contacts & campaigns';
const DESCRIPTION =
  'A shared WhatsApp Business inbox with contacts, boards, templates and campaigns, built on your CPaaS workspace. Android, iPhone and web, in 17 languages.';
const IMAGE = `${SITE}/og-image.png`;

export default function Root({ children }: PropsWithChildren) {
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } = useServerDocumentContext();
  // A page with its own title / description (generateMetadata) keeps only those.
  const own = Children.toArray(headNodes).filter(isValidElement) as { type: unknown; props: { name?: string; property?: string } }[];
  const hasTitle = own.some((n) => n.type === 'title');
  const hasDescription = own.some((n) => n.type === 'meta' && n.props.name === 'description');

  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        {/* The app is a fixed full-screen view: the page itself never scrolls or pans sideways (mobile browsers included). */}
        <style dangerouslySetInnerHTML={{ __html: 'html,body{overflow:hidden;overscroll-behavior:none;width:100%;height:100%}#root{overflow:hidden}' }} />
        {headNodes}

        {hasTitle ? null : <title>{TITLE}</title>}
        {hasDescription ? null : <meta name="description" content={DESCRIPTION} />}
        <meta name="application-name" content="Inbox And Campaigns" />
        <meta name="theme-color" content="#0F0F1A" />
        <meta name="color-scheme" content="dark light" />
        <link rel="canonical" href={SITE} />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.webmanifest" />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Inbox And Campaigns" />
        <meta property="og:url" content={SITE} />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:image" content={IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Inbox And Campaigns: WhatsApp inbox, contacts and campaigns on one screen" />
        <meta property="og:locale" content="en_IN" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESCRIPTION} />
        <meta name="twitter:image" content={IMAGE} />
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
