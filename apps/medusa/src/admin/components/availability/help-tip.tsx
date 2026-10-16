import { InformationCircle } from '@medusajs/icons';
import { IconButton, Tooltip } from '@medusajs/ui';

/** Match the admin's pricing-field help: a named, keyboard-focusable tooltip trigger. */
export function HelpTip({ label, content }: { label: string; content: string }) {
  return (
    <Tooltip content={content}>
      <IconButton
        type="button"
        variant="transparent"
        size="2xsmall"
        className="shrink-0 text-ui-fg-muted"
        aria-label={label}
      >
        <InformationCircle aria-hidden="true" />
      </IconButton>
    </Tooltip>
  );
}
