import { XMark } from '@medusajs/icons';
import { Button, Drawer, Heading, IconButton, Text } from '@medusajs/ui';
import { useState, type ReactNode } from 'react';

/** Stage only this section; applying never replaces other Availability fields. */
export function SettingsDrawer<T>({
  title,
  description,
  value,
  onApply,
  onEditing,
  validate,
  disabled = false,
  children,
  triggerLabel = `Edit ${title.toLowerCase()}`,
}: {
  title: string;
  description: string;
  value: T;
  onApply: (value: T) => void;
  onEditing: (editing: boolean) => void;
  validate?: (value: T) => string;
  disabled?: boolean;
  children: (value: T, onChange: (value: T) => void) => ReactNode;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const error = validate?.(draft);
  const changeOpen = (next: boolean) => {
    if (disabled) return;
    if (next) {
      // Editors update immutably, so the input snapshot can be reused until edited.
      setDraft(value);
    }
    setOpen(next);
    onEditing(next);
  };
  return (
    <Drawer open={open} onOpenChange={changeOpen}>
      <Drawer.Trigger asChild>
        <Button type="button" size="small" variant="secondary" disabled={disabled} aria-label={triggerLabel}>
          Edit
        </Button>
      </Drawer.Trigger>
      <Drawer.Content className="z-50" overlayProps={{ className: 'z-50' }}>
        <div className="flex items-start justify-between gap-4 border-b border-ui-border-base px-6 py-4">
          <div className="space-y-1">
            <Drawer.Title asChild>
              <Heading level="h2">{title}</Heading>
            </Drawer.Title>
            <Drawer.Description className="text-ui-fg-subtle text-sm">{description}</Drawer.Description>
          </div>
          <Drawer.Close asChild>
            <IconButton
              type="button"
              size="small"
              variant="transparent"
              disabled={disabled}
              aria-label={`Close ${title.toLowerCase()}`}
            >
              <XMark />
            </IconButton>
          </Drawer.Close>
        </div>
        <Drawer.Body className="overflow-y-auto">
          <fieldset disabled={disabled} className="min-w-0 space-y-4">
            {children(draft, setDraft)}
            {error && (
              <Text size="small" role="alert" className="text-ui-fg-error">
                {error}
              </Text>
            )}
          </fieldset>
        </Drawer.Body>
        <Drawer.Footer className="flex-wrap gap-y-2">
          <Text size="small" className="mr-auto w-full text-ui-fg-subtle">
            Apply, then save availability to keep your changes.
          </Text>
          <Drawer.Close asChild>
            <Button type="button" size="small" variant="secondary" disabled={disabled}>
              Cancel
            </Button>
          </Drawer.Close>
          <Button
            type="button"
            size="small"
            disabled={disabled || !!error}
            onClick={() => {
              if (disabled || error) return;
              onApply(draft);
              changeOpen(false);
            }}
          >
            Apply changes
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  );
}
