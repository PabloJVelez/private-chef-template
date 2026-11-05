import { Button, Input, Label, Select, Switch, Text, Textarea } from '@medusajs/ui';
import type { MealPrepSetup } from '../../../lib/availability/slots';

type DeliveryArea = MealPrepSetup['delivery_area'];
export function DeliveryAreaFields({
  value,
  onChange,
}: { value: DeliveryArea; onChange: (value: DeliveryArea) => void }) {
  return (
    <div className="space-y-6">
      <Text size="small" className="text-ui-fg-subtle">
        Delivery is free within your approved area. These preferences are not active yet.
      </Text>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="delivery-radius">Radius around an address</Label>
          <Switch
            id="delivery-radius"
            checked={value.radius !== null}
            onCheckedChange={(checked) =>
              onChange({ ...value, radius: checked ? { address: '', distance: 0, unit: 'mi' } : null })
            }
          />
        </div>
        {value.radius && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="radius-center">Center address</Label>
              <Input
                id="radius-center"
                value={value.radius.address}
                onChange={(e) => onChange({ ...value, radius: { ...value.radius!, address: e.target.value } })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="radius-distance">Distance</Label>
                <Input
                  id="radius-distance"
                  type="number"
                  min="0"
                  step="any"
                  value={value.radius.distance || ''}
                  onChange={(e) =>
                    onChange({ ...value, radius: { ...value.radius!, distance: Number(e.target.value) } })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="radius-unit">Unit</Label>
                <Select
                  value={value.radius.unit}
                  onValueChange={(unit) =>
                    onChange({ ...value, radius: { ...value.radius!, unit: unit as 'mi' | 'km' } })
                  }
                >
                  <Select.Trigger id="radius-unit">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content className="z-50">
                    <Select.Item value="mi">Miles</Select.Item>
                    <Select.Item value="km">Kilometers</Select.Item>
                  </Select.Content>
                </Select>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="delivery-zips">ZIP codes</Label>
        <Textarea
          id="delivery-zips"
          aria-describedby="delivery-zips-help"
          value={value.zip_codes.join(', ')}
          onChange={(e) =>
            onChange({ ...value, zip_codes: e.target.value ? e.target.value.split(/[\n,]/).map((v) => v.trim()) : [] })
          }
        />
        <Text id="delivery-zips-help" size="small" className="text-ui-fg-subtle">
          Separate ZIP codes with commas or new lines.
        </Text>
        {value.zip_codes.length > 0 && (
          <Button type="button" variant="secondary" size="small" onClick={() => onChange({ ...value, zip_codes: [] })}>
            Clear ZIP codes
          </Button>
        )}
      </div>
    </div>
  );
}
