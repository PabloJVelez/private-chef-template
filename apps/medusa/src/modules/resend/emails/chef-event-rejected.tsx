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

type ChefEventRejectedEmailProps = {
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
  rejection: {
    reason: string
    chefNotes: string
  }
  chef: {
    name: string
    email: string
    phone: string
  }
  requestReference: string
  rejectionDate: string
  emailType: "customer_rejection"
}

function ChefEventRejectedEmailComponent({ 
  customer, 
  booking, 
  rejection, 
  chef, 
  requestReference, 
  rejectionDate 
}: ChefEventRejectedEmailProps) {
  
  return (
    <Tailwind>
      <Html className="font-sans bg-gray-100">
        <Head />
        <Preview>Update regarding your chef event request</Preview>
        <Body className="bg-white my-10 mx-auto w-full max-w-2xl">
          {/* Header */}
          <Section className="bg-gradient-to-r from-gray-500 to-gray-600 text-white px-6 py-4">
            <Container>
              <Row>
                <Column>
                  <Heading className="text-2xl font-bold m-0">
                    Event Request Update
                  </Heading>
                  <Text className="text-gray-100 m-0">
                    Important information about your booking
                  </Text>
                </Column>
              </Row>
            </Container>
          </Section>

          {/* Main Content */}
          <Container className="p-6">
            <Heading className="text-2xl font-bold text-gray-800 mb-4">
              Hi {customer.first_name},
            </Heading>
            <Text className="text-gray-600 mb-6">
              Thank you for your interest in our chef services. After careful consideration, 
              we regret to inform you that we are unable to accommodate your event request at this time.
            </Text>

            {/* Rejection Details */}
            <Section className="bg-red-50 rounded-lg p-6 mb-6">
              <Heading className="text-lg font-semibold text-gray-800 mb-4">
                Request Details
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
            </Section>

            {/* Rejection Reason */}
            <Section className="bg-yellow-50 rounded-lg p-6 mb-6">
              <Heading className="text-lg font-semibold text-gray-800 mb-4">
                Reason for Decline
              </Heading>
              <Text className="text-gray-600 mb-4">
                {rejection.reason}
              </Text>
              
              {rejection.chefNotes && (
                <>
                  <Text className="font-semibold text-gray-700 mb-2">
                    Additional Notes from Chef Luis Velez:
                  </Text>
                  <Text className="text-gray-600 italic">
                    "{rejection.chefNotes}"
                  </Text>
                </>
              )}
            </Section>

            {/* Alternative Options */}
            <Section className="bg-blue-50 rounded-lg p-6 mb-6">
              <Heading className="text-lg font-semibold text-gray-800 mb-4">
                Alternative Options
              </Heading>
              <Text className="text-gray-600 mb-4">
                We'd love to work with you in the future. Here are some alternatives:
              </Text>
              
              <Row className="mb-3">
                <Text className="text-gray-600">
                  • Consider a different date or time
                </Text>
              </Row>
              
              <Row className="mb-3">
                <Text className="text-gray-600">
                  • Explore our other event types
                </Text>
              </Row>
              
              <Row className="mb-3">
                <Text className="text-gray-600">
                  • Check our availability for smaller groups
                </Text>
              </Row>
              
              <Row>
                <Text className="text-gray-600">
                  • Contact us for custom arrangements
                </Text>
              </Row>
            </Section>

            {/* Reference Number */}
            <Section className="text-center mb-6">
              <Text className="text-sm text-gray-500">
                Reference: <strong>{requestReference}</strong>
              </Text>
              <Text className="text-sm text-gray-500">
                Updated on: {rejectionDate}
              </Text>
            </Section>

            {/* Contact Information */}
            <Section className="bg-gray-50 rounded-lg p-6 mb-6">
              <Heading className="text-lg font-semibold text-gray-800 mb-4">
                Get in Touch
              </Heading>
              <Text className="text-gray-600 mb-4">
                We're here to help you plan the perfect event. Feel free to reach out with any questions or to discuss alternative arrangements.
              </Text>
              
              <Row className="mb-3">
                <Text className="text-gray-600">
                  <strong>Email:</strong> {chef.email}
                </Text>
              </Row>
              
              <Row className="mb-3">
                <Text className="text-gray-600">
                  <strong>Phone:</strong> {chef.phone}
                </Text>
              </Row>
              
              <Row>
                <Text className="text-gray-600">
                  <strong>Website:</strong> www.chefvelez.com
                </Text>
              </Row>
            </Section>
          </Container>

          {/* Footer */}
          <Section className="bg-gray-50 p-6">
            <Container>
              <Row>
                <Column>
                  <Text className="text-center text-gray-500 text-sm mb-4">
                    Thank you for considering Chef Luis Velez for your event
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

export const chefEventRejectedEmail = (props: ChefEventRejectedEmailProps) => (
  <ChefEventRejectedEmailComponent {...props} />
) 