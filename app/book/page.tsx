import { redirect } from 'next/navigation';

export default async function BookRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ clinic?: string }>;
}) {
  const params = await searchParams;
  const clinic = params?.clinic ? `?clinic=${encodeURIComponent(params.clinic)}` : '';
  redirect(`/appointments/new${clinic}`);
}

