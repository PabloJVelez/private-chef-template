import { Container } from '@app/components/common/container/Container';
import { Button } from '@app/components/common/buttons/Button';
import { CheckCircleIcon, ClockIcon, EnvelopeIcon, PhoneIcon } from '@heroicons/react/24/outline';
import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from 'react-router';
import { useLoaderData, useSearchParams, Link, redirect } from 'react-router';

export const meta: MetaFunction = () => {
  return [
    { title: 'Request Submitted Successfully - Private Chef' },
    {
      name: 'description',
      content:
        'Your culinary experience request has been submitted successfully. Your request will be reviewed and responded to within 24 hours.',
    },
    { property: 'og:title', content: 'Request Submitted Successfully - Private Chef' },
    {
      property: 'og:description',
      content:
        'Your culinary experience request has been submitted successfully. Your request will be reviewed and responded to within 24 hours.',
    },
    { property: 'og:type', content: 'website' },
    { name: 'robots', content: 'noindex' }, // Don't index success pages
  ];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const searchParams = new URLSearchParams(url.search);
  const eventId = searchParams.get('eventId') || '';

  if (!eventId) {
    throw redirect('/');
  }

  return {
    eventId: searchParams.get('eventId') || 'unknown',
    supportEmail: 'support@example.com', // TODO: Update with actual support email
    supportPhone: '(702) 349-6158',
    responseTime: '24 hours',
  };
};

// Handle POST requests to success page (redirect to GET)
export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  const eventId = url.searchParams.get('eventId') || '';
  const redirectUrl = `/request/success?eventId=${eventId}`;

  return redirect(redirectUrl);
};

export default function RequestSuccessPage() {
  const { eventId, supportEmail, supportPhone, responseTime } = useLoaderData<typeof loader>();

  return (
    <Container className="py-12 lg:py-16 max-w-4xl">
      <div className="text-center">
        {/* Success Icon */}
        <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-6">
          <CheckCircleIcon className="w-8 h-8 text-green-600" />
        </div>

        {/* Success Message */}
        <h1 className="text-4xl md:text-5xl font-italiana text-primary-900 mb-4">Request Submitted Successfully!</h1>
        <p className="text-lg text-primary-600 max-w-2xl mx-auto mb-8">
          Thank you for your interest in a personalized culinary experience. Your request has been received and will be
          reviewed shortly.
        </p>

        {/* Request Reference */}
        {eventId && (
          <div className="bg-gray-50 rounded-lg p-6 mb-8 max-w-md mx-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Request Reference</h2>
            <p className="text-sm text-gray-600 mb-2">Keep this reference number for your records:</p>
            <p className="text-lg font-mono text-primary-600 bg-white px-4 py-2 rounded border">
              {eventId.slice(0, 8).toUpperCase()}
            </p>
          </div>
        )}

        {/* What Happens Next */}
        <div className="bg-white rounded-lg border border-gray-200 p-8 mb-8 text-left">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6 text-center">What Happens Next?</h2>

          <div className="space-y-6">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-primary-600 font-semibold">1</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Review & Assessment</h3>
                <p className="text-gray-600">
                  Your request details will be reviewed, including menu preferences, party size, and special
                  requirements to ensure the perfect experience can be created.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-primary-600 font-semibold">2</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Custom Proposal</h3>
                <p className="text-gray-600">
                  You'll receive a detailed proposal including the final menu, timeline, pricing breakdown, and any
                  special accommodations for your event.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-primary-600 font-semibold">3</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Confirmation & Booking</h3>
                <p className="text-gray-600">
                  Once approved, your event will be added to our calendar and you'll receive a booking link to purchase
                  tickets for your guests.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-primary-600 font-semibold">4</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Event Preparation</h3>
                <p className="text-gray-600">
                  Final details will be coordinated, ingredients sourced, and everything prepared for your exceptional
                  culinary experience.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Timeline & Contact */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <div className="bg-blue-50 rounded-lg p-6">
            <div className="flex items-center space-x-3 mb-4">
              <ClockIcon className="w-6 h-6 text-blue-600" />
              <h3 className="text-lg font-semibold text-blue-900">Response Timeline</h3>
            </div>
            <p className="text-blue-800 mb-2">
              <strong>Within {responseTime}</strong>
            </p>
            <p className="text-blue-700 text-sm">
              Each request is personally reviewed and will receive a response via email with either approval and next
              steps, or questions for clarification.
            </p>
          </div>

          <div className="bg-green-50 rounded-lg p-6">
            <div className="flex items-center space-x-3 mb-4">
              <EnvelopeIcon className="w-6 h-6 text-green-600" />
              <h3 className="text-lg font-semibold text-green-900">Questions?</h3>
            </div>
            <p className="text-green-800 mb-2">
              <strong>We're here to help!</strong>
            </p>
            <div className="text-green-700 text-sm space-y-1">
              <p>Email: {supportEmail}</p>
              <p>Phone: {supportPhone}</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border px-6 py-3 text-lg font-medium bg-primary-600 hover:bg-primary-700 text-white border-primary-600 hover:border-primary-700 transition-colors"
          >
            Return to Homepage
          </Link>
          <Link
            to="/menus"
            className="inline-flex items-center gap-2 rounded-full border px-6 py-3 text-lg font-medium bg-white hover:bg-gray-50 text-gray-700 border-gray-300 hover:border-gray-400 transition-colors"
          >
            Browse More Menus
          </Link>
        </div>

        {/* Additional Information */}
        <div className="mt-12 p-6 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Important Notes</h3>
          <div className="text-sm text-gray-600 space-y-2">
            <p>
              • <strong>No payment required:</strong> Payment is only collected after your event is confirmed and
              tickets are made available.
            </p>
            <p>
              • <strong>Flexible planning:</strong> Most dietary restrictions and special requests can be accommodated.
            </p>
            <p>
              • <strong>Group bookings:</strong> Once approved, you'll receive a unique booking link to share with your
              guests.
            </p>
            <p>
              • <strong>Cancellation policy:</strong> Full details will be provided in your event proposal.
            </p>
          </div>
        </div>
      </div>
    </Container>
  );
}
