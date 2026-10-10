'use client';

import { useId } from 'react';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import type { ContractType } from '@/types/domain';

const OPTIONS = [
  { value: 'nda', label: 'NDA — Non-Disclosure Agreement' },
  { value: 'msa', label: 'MSA — Master Service Agreement' },
];

export type ContractTypeSelectProps = {
  value: ContractType | null;
  onChange: (t: ContractType) => void;
  /** True from 'uploading' onwards: the type is fixed once the row is created. */
  disabled: boolean;
};

export function ContractTypeSelect({ value, onChange, disabled }: ContractTypeSelectProps) {
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} required>
        Contract type
      </Label>
      <Select
        id={id}
        value={value ?? undefined}
        onValueChange={(v) => onChange(v as ContractType)}
        options={OPTIONS}
        placeholder="Select a contract type"
        disabled={disabled}
        aria-describedby={disabled ? helpId : undefined}
      />
      {disabled && (
        <p id={helpId} className="text-body-sm text-fg-secondary">
          To change the type, remove the file first.
        </p>
      )}
    </div>
  );
}
