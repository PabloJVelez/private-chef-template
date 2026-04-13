import { Badge, Button, Container } from '@medusajs/ui';
import { Link } from 'react-router-dom';
import { useAdminRetrieveMenu } from '../../../hooks/menus';

interface MenuDetailsProps {
  templateProductId?: string;
}

export const MenuDetails = ({ templateProductId }: MenuDetailsProps) => {
  const { data: menu, isLoading } = useAdminRetrieveMenu(templateProductId || '', {
    enabled: !!templateProductId,
  });

  if (!templateProductId) {
    return (
      <Container className="border rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4">Menu Template</h3>
        <p className="text-gray-500">No menu template selected</p>
      </Container>
    );
  }

  if (isLoading) {
    return (
      <Container className="border rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4">Menu Template</h3>
        <p>Loading menu details...</p>
      </Container>
    );
  }

  if (!menu) {
    return (
      <Container className="border rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4">Menu Template</h3>
        <p className="text-red-500">Menu template not found</p>
      </Container>
    );
  }

  return (
    <Container className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Menu Template</h3>
        <Button asChild variant="secondary" size="small">
          <Link to={`/menus/${menu.id}`}>View Menu</Link>
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <h4 className="font-medium">{menu.name}</h4>
          {(menu as any).description && <p className="text-sm text-gray-600 mt-1">{(menu as any).description}</p>}
        </div>

        <div className="flex items-center space-x-2">
          <Badge>{(menu as any).status || 'Active'}</Badge>
          {(menu as any).cuisine && <Badge>{(menu as any).cuisine}</Badge>}
        </div>

        {(menu as any).courses && (menu as any).courses.length > 0 && (
          <div>
            <h5 className="font-medium text-sm">Courses ({(menu as any).courses.length})</h5>
            <ul className="mt-1 text-sm text-gray-600">
              {(menu as any).courses.slice(0, 3).map((course: any) => (
                <li key={course.id} className="truncate">
                  • {course.name}
                </li>
              ))}
              {(menu as any).courses.length > 3 && (
                <li className="text-gray-400">... and {(menu as any).courses.length - 3} more</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </Container>
  );
};
