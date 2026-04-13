import { defineRouteConfig } from '@medusajs/admin-sdk';
import { Container, Heading, toast } from '@medusajs/ui';
import { useAdminRetrieveExperienceType, useAdminUpdateExperienceTypeMutation } from '../../../hooks/experience-types';
import { ExperienceTypeForm } from '../components/experience-type-form';
import { useNavigate, useParams } from 'react-router-dom';
import type { AdminUpdateExperienceTypeDTO } from '../../../../sdk/admin/admin-experience-types';

const ExperienceTypeDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const {
    data: experienceType,
    isLoading,
    refetch,
  } = useAdminRetrieveExperienceType(id as string, {
    enabled: !!id,
  });
  const updateExperienceType = useAdminUpdateExperienceTypeMutation(id as string);

  const handleSubmit = async (data: AdminUpdateExperienceTypeDTO) => {
    try {
      await updateExperienceType.mutateAsync(data);
      toast.success('Experience type updated', {
        description: 'The experience type has been updated successfully.',
        duration: 3000,
      });
      await refetch();
    } catch (error) {
      console.error('Error updating experience type:', error);
      toast.error('Update failed', {
        description: 'There was an error updating the experience type. Please try again.',
        duration: 5000,
      });
    }
  };

  if (isLoading) {
    return (
      <Container>
        <div className="flex h-full items-center justify-center">
          <span>Loading...</span>
        </div>
      </Container>
    );
  }

  if (!experienceType) {
    return (
      <Container>
        <div className="flex h-full items-center justify-center">
          <span>Experience type not found</span>
        </div>
      </Container>
    );
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h1">Edit Experience Type</Heading>
      </div>

      <ExperienceTypeForm
        initialData={experienceType}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/experience-types')}
        isLoading={updateExperienceType.isPending}
      />
    </Container>
  );
};

export const config = defineRouteConfig({
  label: 'Edit Experience Type',
});

export default ExperienceTypeDetailsPage;
