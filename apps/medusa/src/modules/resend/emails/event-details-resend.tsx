import { 
  Text, 
  Column, 
  Container, 
  Heading, 
  Html, 
  Row, 
  Section, 
  Tailwind, 
  Head, 
  Preview, 
  Body, 
  Button,
} from "@react-email/components"

type EventDetailsResendEmailProps = {
  customer: {
    first_name: string
    last_name: string
    email: string
    phone: string
  }
  booking: {
    date: string
    time: string
    event_type: string
    location_type: string
    location_address: string
    party_size: number
    notes: string
  }
  event: {
    status: string
    total_price: string
    price_per_person: string
  }
  product: {
    id: string
    handle: string
    title: string
    purchase_url: string
  }
  chef: {
    name: string
    email: string
    phone: string
  }
  requestReference: string
  customNotes?: string
  emailType: "event_details_resend"
}

function EventDetailsResendEmailComponent({ 
  customer, 
  booking, 
  event, 
  product, 
  chef, 
  requestReference,
  customNotes
}: EventDetailsResendEmailProps) {
  
  return (
    <Tailwind>
      <Html className="font-sans bg-gray-100">
        <Head />
        <Preview>Your chef event details and confirmation</Preview>
        <Body className="bg-white my-10 mx-auto w-full max-w-2xl">
          {/* Header */}
          <Section className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-4">
            <Container>
              <Row>
                <Column>
                  <Heading className="text-2xl font-bold m-0">
                    📧 Event Details Reminder
                  </Heading>
                  <Text className="text-blue-100 m-0">
                    Your confirmed chef event information
                  </Text>
                </Column>
              </Row>
            </Container>
          </Section>

          {/* Main Content */}
          <Container className="p-6">
            <Heading className="text-2xl font-bold text-gray-800 mb-4">
              Hi {customer.first_name}!
            </Heading>
            <Text className="text-gray-600 mb-6">
              Here are your confirmed event details. We're looking forward to creating an amazing culinary experience for you!
            </Text>

            {/* Custom Notes from Chef */}
            {customNotes && (
              <Section className="bg-blue-50 rounded-lg p-6 mb-6">
                <Heading className="text-lg font-semibold text-gray-800 mb-4">
                  Message from Chef Luis Velez
                </Heading>
                <Text className="text-gray-600 italic">
                  "{customNotes}"
                </Text>
              </Section>
            )}

            {/* Event Details */}
            <Section className="bg-gray-50 rounded-lg p-6 mb-6">
              <Heading className="text-lg font-semibold text-gray-800 mb-4">
                Your Event Details
              </Heading>
              
              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Date & Time</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{booking.date} at {booking.time}</Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Event Type</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{booking.event_type}</Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Party Size</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{booking.party_size} guests</Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Location</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">
                    {booking.location_type} - {booking.location_address}
                  </Text>
                </Column>
              </Row>

              {booking.notes && (
                <Row className="mb-3">
                  <Column className="w-1/3">
                    <Text className="font-semibold text-gray-700">Special Notes</Text>
                  </Column>
                  <Column className="w-2/3">
                    <Text className="text-gray-600">{booking.notes}</Text>
                  </Column>
                </Row>
              )}

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Price per Person</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">${event.price_per_person}</Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Total Price</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600 font-bold text-lg">${event.total_price}</Text>
                </Column>
              </Row>
            </Section>

            {/* Event Access */}
            {product && (
              <Section className="bg-green-50 rounded-lg p-6 mb-6">
                <Heading className="text-lg font-semibold text-gray-800 mb-4">
                  Event Access
                </Heading>
                <Text className="text-gray-600 mb-4">
                  Access your event details and purchase additional tickets if needed.
                </Text>
                
                <Row className="text-center">
                  <Column>
                    <Button 
                      href={product.purchase_url}
                      className="bg-green-600 text-white px-8 py-4 rounded-lg font-semibold text-lg"
                    >
                      View Event Details
                    </Button>
                  </Column>
                </Row>
              </Section>
            )}

            {/* Important Information */}
            <Section className="bg-yellow-50 rounded-lg p-6 mb-6">
              <Heading className="text-lg font-semibold text-gray-800 mb-4">
                Important Reminders
              </Heading>
              <Text className="text-gray-600 mb-3">
                • Chef Luis Velez will contact you 24 hours before the event
              </Text>
              <Text className="text-gray-600 mb-3">
                • Please ensure your kitchen is clean and ready for the chef
              </Text>
              <Text className="text-gray-600 mb-3">
                • Any dietary restrictions should be communicated in advance
              </Text>
              <Text className="text-gray-600">
                • Contact us immediately if you need to make any changes
              </Text>
            </Section>

            {/* Reference Number */}
            <Section className="text-center mb-6">
              <Text className="text-sm text-gray-500">
                Reference: <strong>{requestReference}</strong>
              </Text>
            </Section>
          </Container>

          {/* Footer */}
          <Section className="bg-gray-50 p-6">
            <Container>
              <Row>
                <Column>
                  <Text className="text-center text-gray-500 text-sm mb-4">
                    Questions? Contact Chef Luis Velez at {chef.email} or {chef.phone}
                  </Text>
                  <Text className="text-center text-gray-400 text-xs">
                    © {new Date().getFullYear()} Chef Luis Velez. All rights reserved.
                  </Text>
                </Column>
              </Row>
            </Container>
          </Section>
        </Body>
      </Html>
    </Tailwind>
  )
}

export const eventDetailsResendEmail = (props: EventDetailsResendEmailProps) => (
  <EventDetailsResendEmailComponent {...props} />
)