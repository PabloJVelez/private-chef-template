import { NavigationCollection, NavigationItemLocation } from '@libs/types';

export const headerNavigationItems: NavigationCollection = [
  {
    id: 1,
    label: 'Our Menus',
    url: '/menus',
    sort_order: 0,
    location: NavigationItemLocation.header,
    new_tab: false,
  },
  {
    id: 2,
    label: 'How It Works',
    url: '/how-it-works',
    sort_order: 1,
    location: NavigationItemLocation.header,
    new_tab: false,
  },
  {
    id: 3,
    label: 'Request Event',
    url: '/request',
    sort_order: 2,
    location: NavigationItemLocation.header,
    new_tab: false,
  },
  {
    id: 4,
    label: 'About Chef',
    url: '/about',
    sort_order: 3,
    location: NavigationItemLocation.header,
    new_tab: false,
  },
];

export const footerNavigationItems: NavigationCollection = [
  {
    id: 1,
    label: 'Our Menus',
    url: '/menus',
    location: NavigationItemLocation.footer,
    sort_order: 1,
    new_tab: false,
  },
  // {
  //   id: 2,
  //   label: 'Cooking Classes',
  //   url: '/experiences#cooking_class',
  //   location: NavigationItemLocation.footer,
  //   sort_order: 2,
  //   new_tab: false,
  // },
  // {
  //   id: 3,
  //   label: 'Plated Dinners',
  //   url: '/experiences#plated_dinner',
  //   location: NavigationItemLocation.footer,
  //   sort_order: 3,
  //   new_tab: false,
  // },
  // {
  //   id: 4,
  //   label: 'Buffet Style',
  //   url: '/experiences#buffet_style',
  //   location: NavigationItemLocation.footer,
  //   sort_order: 4,
  //   new_tab: false,
  // },
  // {
  //   id: 5,
  //   label: 'How It Works',
  //   url: '/how-it-works',
  //   location: NavigationItemLocation.footer,
  //   sort_order: 5,
  //   new_tab: false,
  // },
  // {
  //   id: 6,
  //   label: 'About Chef Velez',
  //   url: '/about',
  //   location: NavigationItemLocation.footer,
  //   sort_order: 6,
  //   new_tab: false,
  // },
];
