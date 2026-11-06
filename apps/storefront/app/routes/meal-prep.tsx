import { data, type LoaderFunctionArgs } from 'react-router';
import { readMealPrep } from '@libs/util/server/meal-prep.server';
import { MealPrepContent } from '@app/components/meal-prep/MealPrepContent';

export async function loader({ request }: LoaderFunctionArgs) {
  const mealPrep = await readMealPrep(request);
  return data({ mealPrep }, { status: mealPrep.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
export const headers = () => ({ 'Cache-Control': 'no-store' });
export const meta = () => [
  { title: 'Meal Prep | Private Chef' },
  { name: 'description', content: 'Explore the chef’s meal preparation options.' },
];
export default MealPrepContent;
