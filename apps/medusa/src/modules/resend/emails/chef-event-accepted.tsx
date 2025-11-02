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
  Link, 
  Button,
} from "@react-email/components"

type ChefEventAcceptedEmailProps = {
  customer: {
    first_name: string
    last_name: string
    email: string
    phone: string
  }
  booking: {
    date: string
    time: string
    menu: string
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
    deposit_required: string
    deposit_deadline: string
    minimum_tickets: number
    is_full_deposit: boolean
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
  acceptanceDate: string
  chefNotes: string
  emailType: "customer_acceptance"
}

function ChefEventAcceptedEmailComponent({ 
  customer, 
  booking, 
  event, 
  product, 
  chef, 
  requestReference, 
  acceptanceDate,
  chefNotes 
}: ChefEventAcceptedEmailProps) {
  
  return (
    <Tailwind>
      <Html className="font-sans bg-gray-100">
        <Head />
        <Preview>Great news! Your chef event has been accepted</Preview>
        <Body className="bg-white my-10 mx-auto w-full max-w-2xl">
          {/* Header */}
          <Section className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-4">
            <Container>
              <Row>
                <Column>
                  <Heading className="text-2xl font-bold m-0">
                    🎉 Booking Confirmed!
                  </Heading>
                  <Text className="text-green-100 m-0">
                    Your chef event request has been confirmed
                  </Text>
                </Column>
              </Row>
            </Container>
          </Section>

          {/* Main Content */}
          <Container className="p-6">
            <Heading className="text-2xl font-bold text-gray-800 mb-4">
              Great News!
            </Heading>
            <Text className="text-gray-600 mb-6">
              Dear {customer.first_name},
            </Text>
            <Text className="text-gray-600 mb-6">
              Your chef has confirmed your booking! Here are your event details:
            </Text>

            {/* Event Details */}
            <Section className="bg-gray-50 rounded-lg p-6 mb-6">
              <Heading className="text-lg font-semibold text-gray-800 mb-4">
                Event Details
              </Heading>
              
              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Date:</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{booking.date}</Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Time:</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{booking.time}</Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Menu:</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{booking.menu}</Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Event Type:</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{booking.event_type}</Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Location:</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{booking.location_type}</Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Address:</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{booking.location_address}</Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Party Size:</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{booking.party_size} guests</Text>
                </Column>
              </Row>
            </Section>

            {/* Payment Details */}
            <Section className="bg-green-50 rounded-lg p-6 mb-6">
              <Heading className="text-lg font-semibold text-gray-800 mb-4">
                Payment Details
              </Heading>
              
              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Total Price:</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600 font-bold">${event.total_price}</Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">
                    {event.is_full_deposit ? 'Full Payment Required:' : 'Minimum Deposit Required:'}
                  </Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600 font-bold">${event.deposit_required}</Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Payment Deadline:</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{event.deposit_deadline}</Text>
                </Column>
              </Row>

              {!event.is_full_deposit && (
                <Row className="mb-3">
                  <Column className="w-1/3">
                    <Text className="font-semibold text-gray-700">Minimum Tickets:</Text>
                  </Column>
                  <Column className="w-2/3">
                    <Text className="text-gray-600">{event.minimum_tickets} tickets</Text>
                  </Column>
                </Row>
              )}

              <Text className="text-gray-600 mt-4">
                {event.is_full_deposit 
                  ? `To secure your booking, please pay the full amount by ${event.deposit_deadline}.`
                  : `To secure your booking, please purchase at least ${event.minimum_tickets} tickets by ${event.deposit_deadline}. Additional guests can purchase their tickets later.`
                }
              </Text>
            </Section>

            {/* Payment Button */}
            <Section className="text-center mb-6">
              <Button 
                href={product.purchase_url}
                className="bg-green-600 text-white px-8 py-4 rounded-lg font-semibold text-lg"
              >
                {event.is_full_deposit ? 'Pay Full Amount Now' : 'Purchase Tickets Now'}
              </Button>
            </Section>

            {/* What's Next */}
            <Section className="bg-blue-50 rounded-lg p-6 mb-6">
              <Heading className="text-lg font-semibold text-gray-800 mb-4">
                What's Next?
              </Heading>
              <Text className="text-gray-600 mb-3">
                1. Pay your deposit to secure the booking
              </Text>
              <Text className="text-gray-600 mb-3">
                2. Our chef will contact you to discuss menu details
              </Text>
              <Text className="text-gray-600">
                3. We'll send you a reminder 48 hours before the event
              </Text>
            </Section>

            {/* Reference Number */}
            <Section className="text-center mb-6">
              <Text className="text-sm text-gray-500">
                Reference: <strong>{requestReference}</strong>
              </Text>
              <Text className="text-sm text-gray-500">
                Accepted on: {acceptanceDate}
              </Text>
            </Section>
          </Container>

          {/* Footer */}
          <Section className="bg-gray-50 p-6">
            <Container>
              <Row>
                <Column>
                  <Text className="text-center text-gray-500 text-sm mb-4">
                    If you have any questions, please don't hesitate to contact us at {chef.email}
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

export const chefEventAcceptedEmail = (props: ChefEventAcceptedEmailProps) => (
  <ChefEventAcceptedEmailComponent {...props} />
) 