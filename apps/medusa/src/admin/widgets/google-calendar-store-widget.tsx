import { defineWidgetConfig } from '@medusajs/admin-sdk';
import { Container, Text } from '@medusajs/ui';
import { Link } from 'react-router-dom';
export const config = defineWidgetConfig({ zone: 'store.details.after' });
const AvailabilityLink = () => {
  return (
    <Container>
      <Text>
        Google Calendar settings have moved to{' '}
        <Link className="underline" to="/settings/availability">
          Availability
        </Link>
        .
      </Text>
    </Container>
  );
};

export default AvailabilityLink;
