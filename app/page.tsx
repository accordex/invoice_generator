import { redirect } from 'next/navigation';

/**
 * Root page redirects unauthenticated visitors to login.
 */
export default function HomePage() {
  redirect('/login');
}
