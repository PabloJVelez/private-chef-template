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

type ChefEventRequestedEmailProps = {
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
    conflict: boolean
  }
  requestReference: string
  chefContact: {
    email: string
    phone: string
  }
  emailType: "customer_confirmation" | "chef_notification"
}

function ChefEventRequestedEmailComponent({ 
  customer, 
  booking, 
  event, 
  requestReference, 
  chefContact,
  emailType 
}: ChefEventRequestedEmailProps) {
  const isCustomerEmail = emailType === "customer_confirmation"
  
  return (
    <Tailwind>
      <Html className="font-sans bg-gray-100">
        <Head />
        <Preview>
          {isCustomerEmail 
            ? "Your chef event request has been received" 
            : "New chef event request received"
          }
        </Preview>
        <Body className="bg-white my-10 mx-auto w-full max-w-2xl">
          {/* Header */}
          <Section className="bg-gradient-to-r from-orange-500 to-red-600 text-white px-6 py-4">
            <Container>
              <Row>
                <Column>
                  <Heading className="text-2xl font-bold m-0">
                    🍳 Chef Luis Velez
                  </Heading>
                  <Text className="text-orange-100 m-0">
                    Private Chef & Culinary Experiences
                  </Text>
                </Column>
              </Row>
            </Container>
          </Section>

          {/* Main Content */}
          <Container className="p-6">
            {isCustomerEmail ? (
              <>
                <Heading className="text-2xl font-bold text-gray-800 mb-4">
                  Thank you for your event request!
                </Heading>
                <Text className="text-gray-600 mb-6">
                  Hi {customer.first_name}, we've received your request for a private chef experience. 
                  We'll review your details and get back to you within 24-48 hours.
                </Text>
              </>
            ) : (
              <>
                <Heading className="text-2xl font-bold text-gray-800 mb-4">
                  New Event Request Received
                </Heading>
                <Text className="text-gray-600 mb-6">
                  You have a new chef event request that requires your review.
                </Text>
              </>
            )}

            {/* Event Details */}
            <Section className="bg-gray-50 rounded-lg p-6 mb-6">
              <Heading className="text-lg font-semibold text-gray-800 mb-4">
                Event Details
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

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Menu</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{booking.menu}</Text>
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
                  <Text className="font-semibold text-gray-700">Total Price</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600 font-bold">${event.total_price}</Text>
                </Column>
              </Row>
            </Section>

            {/* Customer Information */}
            <Section className="bg-blue-50 rounded-lg p-6 mb-6">
              <Heading className="text-lg font-semibold text-gray-800 mb-4">
                Customer Information
              </Heading>
              
              <Row className="mb-2">
                <Text className="text-gray-600">
                  <strong>Name:</strong> {customer.first_name} {customer.last_name}
                </Text>
              </Row>
              
              <Row className="mb-2">
                <Text className="text-gray-600">
                  <strong>Email:</strong> {customer.email}
                </Text>
              </Row>
              
              <Row className="mb-2">
                <Text className="text-gray-600">
                  <strong>Phone:</strong> {customer.phone}
                </Text>
              </Row>
            </Section>

            {/* Reference Number */}
            <Section className="text-center mb-6">
              <Text className="text-sm text-gray-500">
                Reference: <strong>{requestReference}</strong>
              </Text>
            </Section>

            {/* Action Buttons for Chef */}
            {!isCustomerEmail && (
              <Section className="text-center mb-6">
                <Row>
                  <Column>
                    <Button 
                      href={`${process.env.ADMIN_BACKEND_URL}/admin/events/${requestReference}/accept`}
                      className="bg-green-600 text-white px-6 py-3 rounded-lg font-semibold mr-4"
                    >
                      Accept Request
                    </Button>
                    <Button 
                      href={`${process.env.ADMIN_BACKEND_URL}/admin/events/${requestReference}/reject`}
                      className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold"
                    >
                      Decline Request
                    </Button>
                  </Column>
                </Row>
              </Section>
            )}

            {/* Next Steps for Customer */}
            {isCustomerEmail && (
              <Section className="bg-green-50 rounded-lg p-6 mb-6">
                <Heading className="text-lg font-semibold text-gray-800 mb-4">
                  What happens next?
                </Heading>
                <Text className="text-gray-600 mb-3">
                  1. We'll review your request within 24-48 hours
                </Text>
                <Text className="text-gray-600 mb-3">
                  2. You'll receive an email with our decision
                </Text>
                <Text className="text-gray-600 mb-3">
                  3. If accepted, you'll get a secure payment link
                </Text>
                <Text className="text-gray-600">
                  4. We'll confirm all details before your event
                </Text>
              </Section>
            )}
          </Container>

          {/* Footer */}
          <Section className="bg-gray-50 p-6">
            <Container>
              <Row>
                <Column>
                  <Text className="text-center text-gray-500 text-sm mb-4">
                    Questions? Contact us at {chefContact.email} or {chefContact.phone}
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

export const chefEventRequestedEmail = (props: ChefEventRequestedEmailProps) => (
  <ChefEventRequestedEmailComponent {...props} />
) 