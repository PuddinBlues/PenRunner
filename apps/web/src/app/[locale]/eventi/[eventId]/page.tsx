import { LiveEvent } from "../../../../components/LiveEvent";
import type { Locale } from "../../../../lib/i18n";

export const dynamic = "force-dynamic";

export default async function EventPage({
  params,
}: {
  params: Promise<{ locale: Locale; eventId: string }>;
}) {
  const { locale, eventId } = await params;
  return <LiveEvent eventId={eventId} locale={locale} variant="event" />;
}
