import { Container } from '@app/components/common/container';
import { methodCopy, styleCopy } from '@libs/meal-prep';
import { useMealPrep } from '@app/providers/meal-prep-provider';

export function MealPrepContent() {
  const { result, refreshing, refresh } = useMealPrep();
  return (
    <Container className="py-12 md:py-16">
      <div className="max-w-3xl mx-auto">
        <p className="text-sm uppercase tracking-widest text-gray-600 mb-3">At your table</p>
        <h1 className="font-italiana text-4xl md:text-5xl text-gray-900 mb-6">Meal Prep</h1>
        {!result.ok ? (
          <div role="status" className="rounded-lg border border-gray-200 p-6 space-y-4">
            <p>Meal Prep information is temporarily unavailable. Please try again.</p>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="underline underline-offset-4 disabled:opacity-50"
            >
              {refreshing ? 'Refreshing…' : 'Try again'}
            </button>
          </div>
        ) : result.discovery.status !== 'available' ? (
          <p role="status" className="text-lg text-gray-600">
            {result.discovery.status === 'not_offered'
              ? 'Meal Prep is not currently offered.'
              : 'Meal Prep information is currently unavailable.'}
          </p>
        ) : (
          <>
            <p className="text-lg text-gray-600 leading-relaxed mb-8">Explore the chef’s meal preparation options.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {result.discovery.methods.map((method) => (
                <section key={method} className="rounded-lg border border-gray-200 p-6">
                  <h2 className="font-italiana text-2xl text-gray-900 mb-2">{methodCopy[method].name}</h2>
                  <p className="text-gray-600">{methodCopy[method].description}</p>
                </section>
              ))}
            </div>
            {!!result.discovery.selection_styles.length && (
              <section className="mt-8">
                <h2 className="font-italiana text-2xl text-gray-900 mb-3">Menu preferences</h2>
                <ul className="list-disc pl-5 space-y-2 text-gray-600">
                  {result.discovery.selection_styles.map((style) => (
                    <li key={style}>{styleCopy[style]}</li>
                  ))}
                </ul>
              </section>
            )}
            <p className="mt-8 text-sm text-gray-600 border-t border-gray-200 pt-6">
              General service information only. Dates, locations, service areas, menus and prices are not confirmed
              here. Online Meal Prep requests and booking are not available.
            </p>
          </>
        )}
      </div>
    </Container>
  );
}
