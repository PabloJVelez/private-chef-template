import { Button, Container } from '@medusajs/ui';
import { Link } from 'react-router-dom';
import { useAdminRetrieveMenu } from '../../../hooks/menus';

interface MenuDetailsProps {
  templateProductId?: string;
  eventMenuId?: string | null;
  onCustomizeForEvent?: () => void;
  onRevertToInitialMenu?: () => void;
  isCustomizingForEvent?: boolean;
  isRevertingToInitialMenu?: boolean;
}

export const MenuDetails = ({
  templateProductId,
  eventMenuId,
  onCustomizeForEvent,
  onRevertToInitialMenu,
  isCustomizingForEvent = false,
  isRevertingToInitialMenu = false,
}: MenuDetailsProps) => {
  const selectedMenuId = eventMenuId || templateProductId || '';

  const { data: selectedMenu, isLoading } = useAdminRetrieveMenu(selectedMenuId, {
    enabled: !!selectedMenuId,
  });
  const { data: initialMenu } = useAdminRetrieveMenu(templateProductId || '', {
    enabled: !!templateProductId,
  });
  const { data: eventMenu, isLoading: eventMenuLoading } = useAdminRetrieveMenu(eventMenuId || '', {
    enabled: !!eventMenuId,
  });

  if (!selectedMenuId) {
    return (
      <Container className="border rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4">Selected Menu</h3>
        <p className="text-gray-500">No menu selected for this event</p>
      </Container>
    );
  }

  if (isLoading) {
    return (
      <Container className="border rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4">Selected Menu</h3>
        <p>Loading menu details...</p>
      </Container>
    );
  }

  if (!selectedMenu) {
    return (
      <Container className="border rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4">Selected Menu</h3>
        <p className="text-red-500">Selected menu not found</p>
      </Container>
    );
  }

  return (
    <Container className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Selected Menu</h3>
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary" size="small">
            <Link to={`/menus/${selectedMenu.id}`}>View Menu</Link>
          </Button>
          {eventMenuId ? (
            <>
              <Button
                variant="secondary"
                size="small"
                onClick={onRevertToInitialMenu}
                isLoading={isRevertingToInitialMenu}
                disabled={!onRevertToInitialMenu || isRevertingToInitialMenu}
              >
                Revert to Initial Menu
              </Button>
              <Button asChild variant="primary" size="small">
                <Link to={`/menus/${eventMenuId}`}>Edit Event Menu</Link>
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="small"
              onClick={onCustomizeForEvent}
              isLoading={isCustomizingForEvent}
              disabled={!templateProductId || !onCustomizeForEvent || isCustomizingForEvent}
            >
              Create Customized Menu
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h4 className="font-medium">{selectedMenu.name}</h4>
          {(selectedMenu as any).description && (
            <p className="text-sm text-gray-600 mt-1">{(selectedMenu as any).description}</p>
          )}
        </div>

        {(selectedMenu as any).courses && (selectedMenu as any).courses.length > 0 && (
          <div>
            <h5 className="font-medium text-sm">Courses ({(selectedMenu as any).courses.length})</h5>
            <ul className="mt-1 text-sm text-gray-600">
              {(selectedMenu as any).courses.slice(0, 3).map((course: any) => (
                <li key={course.id} className="truncate">
                  • {course.name}
                </li>
              ))}
              {(selectedMenu as any).courses.length > 3 && (
                <li className="text-gray-400">... and {(selectedMenu as any).courses.length - 3} more</li>
              )}
            </ul>
          </div>
        )}
        {templateProductId && initialMenu ? (
          <p className="text-sm text-gray-600">Initially selected menu: {initialMenu.name}</p>
        ) : null}
        {eventMenuId && eventMenuLoading ? (
          <p className="text-sm text-gray-500">Loading event menu details...</p>
        ) : null}
        {eventMenuId && eventMenu ? <p className="text-sm text-gray-600">Event menu: {eventMenu.name}</p> : null}
      </div>
    </Container>
  );
};
