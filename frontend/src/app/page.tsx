import { redirect } from 'next/navigation';

export default function Home() {
  // Initially, we will just redirect to the dashboard view or login.
  // For now, let's redirect to login. The middleware will handle protecting routes.
  redirect('/login');
}
