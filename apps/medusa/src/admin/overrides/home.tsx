import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Default landing after opening the admin app at `/` (replaces dashboard home → /orders).
 */
export const Home = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/chef-events', { replace: true });
  }, [navigate]);

  return <div />;
};

export { Home as Component };
