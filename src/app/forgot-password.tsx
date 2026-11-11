import { Redirect } from 'expo-router';
import type { Metadata } from 'expo-router/server';

/** The sign-in server's default "forgot password" path: the app's own screen. */
/** Web: this page's title and description for search and link previews. */
export function generateMetadata(): Metadata {
  return { title: 'Reset your password · Inbox And Campaigns', description: 'Get a link to reset your Inbox And Campaigns password.' };
}

export default function ForgotPasswordAlias() {
  return <Redirect href="/(auth)/forgot" />;
}
