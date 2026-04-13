import { useFormContext } from 'react-hook-form';
import type { EventRequestFormData } from '@app/routes/request._index';
import type { StoreExperienceTypeDTO } from '@libs/util/server/data/experience-types.server';
import clsx from 'clsx';
import { useMemo, type FC } from 'react';

export interface EventTypeSelectorProps {
  experienceTypes?: StoreExperienceTypeDTO[];
  className?: string;
}

type WorkflowType = 'cooking_class' | 'plated_dinner' | 'buffet_style';

interface FallbackExperienceType {
  id: WorkflowType;
  name: string;
  description: string;
  highlights: string[];
  idealFor: string;
  duration: string;
  icon: string;
  isMostPopular?: boolean;
}

const fallbackTypes: FallbackExperienceType[] = [
  {
    id: 'cooking_class',
    name: 'Cooking Class',
    description: 'Interactive culinary experience where you learn professional techniques',
    highlights: ['Hands-on instruction', 'Learn techniques', 'Interactive experience'],
    idealFor: 'Date nights, team building',
    duration: '3 hours',
    icon: '\u{1F468}\u200D\u{1F373}',
  },
  {
    id: 'plated_dinner',
    name: 'Plated Dinner',
    description: 'Elegant, restaurant-quality dining with multiple courses',
    highlights: ['Multi-course menu', 'Restaurant-quality', 'Full-service dining'],
    idealFor: 'Anniversaries, formal celebrations',
    duration: '4 hours',
    icon: '\u{1F37D}\uFE0F',
    isMostPopular: true,
  },
  {
    id: 'buffet_style',
    name: 'Buffet Style',
    description: 'Perfect for larger gatherings with variety of dishes',
    highlights: ['Multiple dishes', 'Self-service style', 'Great for mingling'],
    idealFor: 'Birthday parties, family gatherings',
    duration: '2.5 hours',
    icon: '\u{1F958}',
  },
];

interface NormalizedOption {
  apiId: string | null;
  workflowType: WorkflowType;
  name: string;
  description: string;
  highlights: string[];
  idealFor: string;
  duration: string;
  icon: string;
  isMostPopular: boolean;
}

function normalizeOptions(apiTypes: StoreExperienceTypeDTO[]): NormalizedOption[] {
  if (apiTypes.length === 0) {
    return fallbackTypes.map((t) => ({
      apiId: null,
      workflowType: t.id,
      name: t.name,
      description: t.description,
      highlights: t.highlights,
      idealFor: t.idealFor,
      duration: t.duration,
      icon: t.icon,
      isMostPopular: t.isMostPopular ?? false,
    }));
  }

  return apiTypes
    .filter((t) => t.is_active)
    .map((t) => ({
      apiId: t.id,
      workflowType: t.workflow_event_type,
      name: t.name,
      description: t.description ?? '',
      highlights: t.highlights ?? [],
      idealFor: t.ideal_for ?? '',
      duration: t.duration_display ?? '',
      icon: t.icon ?? '',
      isMostPopular: t.is_featured,
    }));
}

/** Stable <select> value: catalog rows use exp:id so multiple types can share one workflow. */
function encodeSelectValue(opt: NormalizedOption): string {
  if (opt.apiId) return `exp:${opt.apiId}`;
  return `wf:${opt.workflowType}`;
}

function findOptionByEncodedValue(options: NormalizedOption[], encoded: string): NormalizedOption | undefined {
  if (encoded.startsWith('exp:')) {
    const id = encoded.slice(4);
    return options.find((o) => o.apiId === id);
  }
  if (encoded.startsWith('wf:')) {
    const wf = encoded.slice(3) as WorkflowType;
    return options.find((o) => o.workflowType === wf && !o.apiId) ?? options.find((o) => o.workflowType === wf);
  }
  return undefined;
}

export const EventTypeSelector: FC<EventTypeSelectorProps> = ({ experienceTypes = [], className }) => {
  const { watch, setValue } = useFormContext<EventRequestFormData>();
  const experienceTypeId = watch('experienceTypeId');
  const eventType = watch('eventType');

  const options = useMemo(() => normalizeOptions(experienceTypes), [experienceTypes]);

  const isCatalogMode = options.length > 0 && options[0].apiId != null;

  const selectValue = useMemo(() => {
    if (options.length === 0) return '';
    if (isCatalogMode) {
      const id = experienceTypeId?.trim();
      if (id && options.some((o) => o.apiId === id)) {
        return `exp:${id}`;
      }
      const fallback = options.find((o) => o.isMostPopular) || options[0];
      return encodeSelectValue(fallback);
    }
    return `wf:${eventType || 'plated_dinner'}`;
  }, [options, isCatalogMode, experienceTypeId, eventType]);

  const selectedOption = useMemo(() => {
    if (options.length === 0) return undefined;
    if (isCatalogMode) {
      const id = experienceTypeId?.trim();
      if (id) {
        const byId = options.find((o) => o.apiId === id);
        if (byId) return byId;
      }
      return findOptionByEncodedValue(options, selectValue);
    }
    return options.find((o) => o.workflowType === eventType) ?? options[0];
  }, [options, isCatalogMode, experienceTypeId, eventType, selectValue]);

  const applySelection = (opt: NormalizedOption) => {
    setValue('eventType', opt.workflowType, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
    setValue('experienceTypeId', opt.apiId ?? '', {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });
  };

  const handleSelectChange = (encoded: string) => {
    const opt = findOptionByEncodedValue(options, encoded);
    if (opt) applySelection(opt);
  };

  return (
    <div className={clsx('space-y-6', className)}>
      <div className="text-center">
        <h3 className="text-lg font-semibold text-primary-900 mb-2">Select Your Culinary Experience</h3>
        <p className="text-primary-600">Choose the experience type that best fits your occasion.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-primary-900 mb-3">Experience Type</label>
            <select
              value={selectValue}
              onChange={(e) => handleSelectChange(e.target.value)}
              className="w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500 border-gray-300"
            >
              {options.map((opt) => (
                <option key={encodeSelectValue(opt)} value={encodeSelectValue(opt)}>
                  {opt.name}
                  {opt.isMostPopular ? ' (Most Popular)' : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedOption && (
            <div className="relative bg-white border-2 border-gray-200 rounded-lg p-6 shadow-sm">
              {selectedOption.isMostPopular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
                  <span className="bg-accent-500 text-white px-4 py-1 rounded-full text-sm font-medium shadow-md">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="text-center space-y-6">
                {selectedOption.icon && (
                  <div className="mx-auto w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
                    <span className="text-4xl">{selectedOption.icon}</span>
                  </div>
                )}

                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{selectedOption.name}</h3>
                  {selectedOption.duration && (
                    <p className="text-lg text-gray-600 font-medium">{selectedOption.duration}</p>
                  )}
                </div>

                {selectedOption.description && (
                  <p className="text-gray-700 text-base leading-relaxed max-w-md mx-auto">
                    {selectedOption.description}
                  </p>
                )}

                {selectedOption.highlights.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="font-semibold text-gray-900 text-lg">What's Included:</h4>
                    <ul className="space-y-2">
                      {selectedOption.highlights.map((h, i) => (
                        <li key={i} className="flex items-start text-gray-700">
                          <span className="w-2 h-2 bg-accent-500 rounded-full mt-2 mr-3 flex-shrink-0" />
                          <span className="text-sm">{h}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedOption.idealFor && (
                  <div>
                    <h4 className="font-semibold text-gray-900 text-lg mb-2">Ideal For:</h4>
                    <p className="text-gray-700 text-sm">{selectedOption.idealFor}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EventTypeSelector;
