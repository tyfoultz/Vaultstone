import type { StructuredField } from '@vaultstone/types';

import { DateFreeformField } from './DateFreeformField';
import { LongTextField } from './LongTextField';
import { NumberField } from './NumberField';
import { PageRefField } from './PageRefField';
import { PcRefField } from './PcRefField';
import { SelectField } from './SelectField';
import { TagsField } from './TagsField';
import { TextField } from './TextField';

type Props = {
  field: StructuredField;
  value: unknown;
  onChange: (value: unknown) => void;
  worldId: string;
  compact?: boolean;
};

export function FieldRenderer({ field, value, onChange, worldId, compact }: Props) {
  switch (field.type) {
    case 'text':
      return <TextField field={field} value={value} onChange={onChange} compact={compact} />;
    case 'long_text':
      return <LongTextField field={field} value={value} onChange={onChange} />;
    case 'select':
      return <SelectField field={field} value={value} onChange={onChange} compact={compact} />;
    case 'tags':
      return <TagsField field={field} value={value} onChange={onChange} compact={compact} />;
    case 'page_ref':
      return (
        <PageRefField field={field} value={value} onChange={onChange} worldId={worldId} compact={compact} />
      );
    case 'number':
      return <NumberField field={field} value={value} onChange={onChange} />;
    case 'date_freeform':
      return <DateFreeformField field={field} value={value} onChange={onChange} />;
    case 'pc_ref':
      return <PcRefField field={field} value={value} onChange={onChange} />;
    default:
      return null;
  }
}
