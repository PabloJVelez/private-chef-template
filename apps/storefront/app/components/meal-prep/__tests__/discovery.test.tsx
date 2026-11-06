/** @jest-environment ./test-browser-environment.cjs */
import React from 'react';
import { createMemoryRouter, RouterProvider, Outlet, Link } from 'react-router';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { MealPrepProvider } from '@app/providers/meal-prep-provider';
import { MealPrepContent } from '../MealPrepContent';
import type { MealPrepRead, MealPrepDiscovery } from '@libs/meal-prep';
jest.mock('@app/hooks/useRootLoaderData', () => ({ useRootLoaderData: () => ({ siteDetails: { headerNavigationItems: [{ id: 1, label: 'Private events', url: '/request' }] } }) }));
const { useSiteDetails } = require('@app/hooks/useSiteDetails');
const available = (methods: MealPrepDiscovery['methods'] = ['in_home']): MealPrepRead => ({ ok: true, discovery: { status: 'available', can_request: false, methods, selection_styles: ['individual_dishes', 'package', 'chosen_menu', 'tailored_plan'] } });
const off: MealPrepRead = { ok: true, discovery: { status: 'not_offered', can_request: false, methods: [], selection_styles: [] } };
const failure: MealPrepRead = { ok: false };
let committed: MealPrepRead;
const rootLoader = jest.fn();
const landingLoader = jest.fn();
const resource = jest.fn();
function Nav() {
  const { headerNavigationItems } = useSiteDetails();
  return <nav>{headerNavigationItems.map((item: { id: number; url: string; label: string }) => <Link key={item.id} to={item.url}>{item.label}</Link>)}<Link to="/">Home</Link></nav>;
}
function mount(initial = '/', initialRead = committed) {
  const routes = [{ id: 'root', path: '/', loader: rootLoader, shouldRevalidate: () => false,
    element: <MealPrepProvider><Nav /><Outlet /></MealPrepProvider>, children: [
      { index: true, element: <p>Private chef home</p> },
      { path: 'request', element: <p>Private event request</p> },
      { id: 'routes/meal-prep', path: 'meal-prep', loader: landingLoader, element: <MealPrepContent /> },
    ] }];
  const router = createMemoryRouter(routes, { initialEntries: [initial], hydrationData: {
    loaderData: { root: { mealPrep: initialRead }, ...(initial === '/meal-prep' ? { 'routes/meal-prep': { mealPrep: initialRead } } : {}) },
  } });
  render(<RouterProvider router={router} />);
  return router;
}
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => {
  jest.clearAllMocks(); committed = available();
  rootLoader.mockImplementation(() => ({ mealPrep: committed }));
  landingLoader.mockImplementation(() => ({ mealPrep: committed }));
  resource.mockImplementation(async () => ({ ok: committed.ok, json: async () => committed.ok ? committed.discovery : {} }));
  global.fetch = resource;
});
afterEach(cleanup);

test('SD-04/05/07/14/17 hydrated information has no booking controls, fabricated prices or event durations', () => {
  const view = mount('/meal-prep', available(['in_home', 'delivery', 'pickup']));
  expect(screen.getByRole('heading', { name: 'Delivery' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Pickup' })).toBeTruthy();
  expect(screen.getByText('Packages')).toBeTruthy();
  expect(screen.getByText(/Online Meal Prep requests and booking are not available/)).toBeTruthy();
  expect(document.querySelector('main form, input, select')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
  expect(document.body.textContent).not.toMatch(/\$|per person|hours|free delivery/i);
  expect(document.querySelectorAll('section').length).toBe(4);
});
test.each([off, { ok: true, discovery: { ...off.discovery, status: 'unavailable' } } as MealPrepRead])('SD-04/05 absent nav for confirmed %j', (value) => {
  mount('/meal-prep', value);
  expect(screen.queryByRole('link', { name: 'Meal Prep' })).toBeNull();
  expect(screen.queryByText(/temporarily unavailable/)).toBeNull();
  expect(screen.getByRole('status')).toBeTruthy();
});
test('SD-09/10 cold failure leaves private-event navigation functional and landing retry works', async () => {
  mount('/meal-prep', failure);
  expect(screen.getByRole('link', { name: 'Private events' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Meal Prep' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('heading', { name: 'In-home cooking' });
  expect(resource).toHaveBeenCalledWith('/api/meal-prep', expect.objectContaining({ cache: 'no-store' }));
  expect(rootLoader).not.toHaveBeenCalled();
});
test('SD-01/11/12 navigation reads current settings, keeps nav/page coherent, and preserves refreshed nav when leaving', async () => {
  const router = mount();
  committed = available(['pickup']);
  fireEvent.click(screen.getByRole('link', { name: 'Meal Prep' }));
  await screen.findByRole('heading', { name: 'Pickup' });
  expect(landingLoader).toHaveBeenCalledTimes(1);
  expect(rootLoader).not.toHaveBeenCalled();
  committed = off;
  fireEvent(window, new Event('focus'));
  await screen.findByText('Meal Prep is not currently offered.');
  expect(screen.queryByRole('link', { name: 'Meal Prep' })).toBeNull();
  fireEvent.click(screen.getByRole('link', { name: 'Home' }));
  await screen.findByText('Private chef home');
  expect(screen.queryByRole('link', { name: 'Meal Prep' })).toBeNull();
  committed = available(['delivery']);
  await act(async () => { await router.navigate('/meal-prep'); });
  await screen.findByRole('heading', { name: 'Delivery' });
  expect(rootLoader).not.toHaveBeenCalled();
});
test('SD-10/12 warm outage retains only navigation; page errors and confirmed off removes nav', async () => {
  mount('/meal-prep');
  committed = failure;
  fireEvent(window, new Event('focus'));
  await screen.findByRole('button', { name: 'Try again' });
  expect(screen.getByRole('link', { name: 'Meal Prep' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'In-home cooking' })).toBeNull();
  committed = off;
  fireEvent(window, new Event('focus'));
  await screen.findByText('Meal Prep is not currently offered.');
  expect(screen.queryByRole('link', { name: 'Meal Prep' })).toBeNull();
});
test('SD-12 older overlapping focus response cannot overwrite newer status', async () => {
  mount('/meal-prep');
  const older = deferred<any>();
  resource.mockReturnValueOnce(older.promise);
  fireEvent(window, new Event('focus'));
  committed = available(['pickup']);
  fireEvent(window, new Event('focus'));
  await screen.findByRole('heading', { name: 'Pickup' });
  await act(async () => { older.resolve({ ok: true, json: async () => off.discovery }); });
  expect(screen.getByRole('heading', { name: 'Pickup' })).toBeTruthy();
});
test('SD-12 navigation invalidates a pending older focus read without refetching root data', async () => {
  mount();
  const older = deferred<any>(); resource.mockReturnValueOnce(older.promise);
  fireEvent(window, new Event('focus'));
  committed = available(['delivery']);
  fireEvent.click(screen.getByRole('link', { name: 'Meal Prep' }));
  await screen.findByRole('heading', { name: 'Delivery' });
  await act(async () => { older.resolve({ ok: true, json: async () => off.discovery }); });
  expect(screen.getByRole('heading', { name: 'Delivery' })).toBeTruthy();
  expect(rootLoader).not.toHaveBeenCalled();
});
