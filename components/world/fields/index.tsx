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
};

// Dispatcher: given a field definition, render the correct typed input.
// Field renderers each own their own input widget + label, so the parent
// form just iterates `template.fields`.
export function FieldRenderer({ field, value, onChange, worldId }: Props) {
  switch (field.type) {
    case 'text':
      return <TextField field={field} value={value} onChange={onChange} />;
    case 'long_text':
      return <LongTextField field={field} value={value} onChange={onChange} />;
    case 'select':
      return <SelectField field={field} value={value} onChange={onChange} />;
    case 'tags':
      return <TagsField field={field} value={value} onChange={onChange} />;
    case 'page_ref':
      return (
        <PageRefField field={field} value={value} onChange={onChange} worldId={worldId} />
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
