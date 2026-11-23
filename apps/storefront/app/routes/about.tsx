import { Link, type MetaFunction } from 'react-router';
import { getChefConfig } from '@libs/config/chef/chef-config';

const chef = getChefConfig();

export const meta: MetaFunction = () => [
  { title: `About ${chef.displayName}` },
  { name: 'description', content: chef.bio.short },
];

export default function AboutChefRoute() {
  return (
    <article className="mx-auto max-w-7xl px-5 py-8 sm:px-10 lg:py-14">
      <header className="grid overflow-hidden rounded-2xl bg-[#373e30] text-[#fff9eb] md:grid-cols-2">
        <img
          src={chef.portrait}
          alt={chef.displayName + ' in the kitchen'}
          className="aspect-[4/3] h-full w-full object-cover object-center md:aspect-auto md:min-h-[30rem]"
        />
        <div className="flex flex-col justify-center px-7 py-10 sm:p-12 lg:p-16">
          <p className="mb-5 text-sm uppercase tracking-[0.18em]">{chef.tagline}</p>
          <h1 className="font-italiana text-6xl leading-none lg:text-8xl">{chef.name}</h1>
          <p className="mt-6 max-w-md text-xl leading-relaxed">{chef.bio.short}</p>
          <div className="mt-8 flex flex-wrap items-center gap-6">
            <Link to="/menus" className="rounded-full bg-[#fff9eb] px-6 py-3 text-[#373e30] hover:bg-white">View menus</Link>
            <Link to="/request" className="underline underline-offset-4">Request an event</Link>
          </div>
        </div>
      </header>

      <section className="grid items-center gap-9 py-14 md:grid-cols-2 md:gap-16 lg:py-20">
        <div className="max-w-prose">
          <h2 className="mb-6 font-italiana text-5xl">In my kitchen</h2>
          <div className="space-y-5 text-lg leading-relaxed">
            {chef.bio.long.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
        </div>
        <figure>
          <img src={chef.hero.imageUrl} alt={chef.hero.imageAlt} loading="lazy" className="aspect-[4/3] w-full rounded-t-full object-cover" />
          <figcaption className="mt-4 border-t border-current pt-3 text-sm">{chef.hero.imageAlt}</figcaption>
        </figure>
      </section>
    </article>
  );
}
