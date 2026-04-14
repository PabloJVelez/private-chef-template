import { defineRouteConfig } from '@medusajs/admin-sdk';
import { Container, Heading, FocusModal, toast, Button } from '@medusajs/ui';
import { ExperienceTypeList } from './components/experience-type-list';
import { ExperienceTypeForm } from './components/experience-type-form';
import { useAdminCreateExperienceTypeMutation } from '../../hooks/experience-types';
import { useState } from 'react';
import type { AdminCreateExperienceTypeDTO } from '../../../sdk/admin/admin-experience-types';

const ExperienceTypesPage = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const createExperienceType = useAdminCreateExperienceTypeMutation();

  const handleCreate = async (data: AdminCreateExperienceTypeDTO) => {
    try {
      await createExperienceType.mutateAsync(data);
      setShowCreateModal(false);
      toast.success('Experience type created', {
        description: 'The experience type has been created successfully.',
        duration: 3000,
      });
    } catch (error) {
      console.error('Error creating experience type:', error);
      toast.error('Creation failed', {
        description: 'There was an error creating the experience type. Please try again.',
        duration: 5000,
      });
    }
  };

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h1">Experience Types</Heading>
      </div>

      <ExperienceTypeList onCreate={() => setShowCreateModal(true)} />

      {showCreateModal && (
        <FocusModal open onOpenChange={setShowCreateModal}>
          <FocusModal.Content className="max-h-[90vh]">
            <FocusModal.Header>
              <FocusModal.Title>Create Experience Type</FocusModal.Title>
            </FocusModal.Header>
            <FocusModal.Body className="max-h-[80vh] overflow-y-auto">
              <ExperienceTypeForm
                onSubmit={handleCreate}
                onCancel={() => setShowCreateModal(false)}
                isLoading={createExperienceType.isPending}
              />
            </FocusModal.Body>
          </FocusModal.Content>
        </FocusModal>
      )}
    </Container>
  );
};

export const config = defineRouteConfig({
  label: 'Experiences',
});

export default ExperienceTypesPage;
